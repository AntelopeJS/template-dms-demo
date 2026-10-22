import { HOST_COMMAND_NAVIGATE_TYPE, LOG_PREFIX } from "./constants";
import { isTypedMessage } from "./typed-message";

interface RouterLike {
	push: (path: string) => unknown;
}

/**
 * The slice of the host's `useDevReload()` composable this module needs:
 * resolve `true` once the committed site layout serves `path`, `false` on
 * timeout.
 */
export interface DevReloadWaiter {
	awaitRoute: (path: string) => Promise<boolean>;
}

export interface HostCommandContext {
	router: RouterLike;
	devReload: DevReloadWaiter;
}

interface HostCommandNavigateMessage {
	type: typeof HOST_COMMAND_NAVIGATE_TYPE;
	path: string;
}

type HostCommandMessage = HostCommandNavigateMessage;

/** Takes a sidecar message already parsed; anything that is not a host command is ignored. */
export type HostCommandDispatcher = (msg: unknown) => void;

/**
 * Commands run one at a time on `tail`. `nextPath` holds the newest navigation
 * target still waiting for a slot, so a burst collapses into a single trip to
 * the latest path instead of racing and landing on the oldest one.
 */
interface DispatcherState {
	ctx: HostCommandContext;
	tail: Promise<void>;
	nextPath: string | null;
}

type HostCommandHandler = (
	msg: HostCommandMessage,
	state: DispatcherState,
) => void;

const IN_APP_PATH = /^\/(?![/\\])/;

function enqueue(state: DispatcherState, job: () => Promise<void>): void {
	state.tail = state.tail.then(job).catch((err: unknown) => {
		console.error(`${LOG_PREFIX} host command failed`, err);
	});
}

// The agent asks to navigate right after writing the page, while the host is
// still re-registering modules: the route can be momentarily unserved and
// pushing now would flash a 404. Wait for the committed layout to serve it.
// Navigate whatever the wait reports — a lapsed deadline or a broken waiter
// must not strand the user on the previous page; a genuinely missing page then
// 404s as it did before.
async function awaitRouteThenPush(
	path: string,
	ctx: HostCommandContext,
): Promise<void> {
	try {
		await ctx.devReload.awaitRoute(path);
	} catch (err: unknown) {
		console.error(`${LOG_PREFIX} dev reload wait failed for ${path}`, err);
	}
	void ctx.router.push(path);
}

async function runNavigate(state: DispatcherState): Promise<void> {
	const path = state.nextPath;
	// A newer navigate already claimed this slot's target: this one is superseded
	// and must not drag the user back to the older path.
	if (path === null) return;
	state.nextPath = null;
	await awaitRouteThenPush(path, state.ctx);
}

/**
 * Whether the agent may send the dashboard to `path`. What it asks for comes
 * from model output, so it may only ever lead to a page of this origin.
 */
function isInAppPath(path: unknown): path is string {
	if (typeof path !== "string" || !IN_APP_PATH.test(path)) return false;
	try {
		const origin = globalThis.location.origin;
		return new URL(path, origin).origin === origin;
	} catch {
		return false;
	}
}

function handleNavigate(msg: HostCommandMessage, state: DispatcherState): void {
	if (msg.type !== HOST_COMMAND_NAVIGATE_TYPE) return;
	if (!isInAppPath(msg.path)) {
		console.warn(`${LOG_PREFIX} refused to navigate off the dashboard`);
		return;
	}
	state.nextPath = msg.path;
	enqueue(state, () => runNavigate(state));
}

const COMMAND_HANDLERS: Record<string, HostCommandHandler> = {
	[HOST_COMMAND_NAVIGATE_TYPE]: handleNavigate,
};

export function createHostCommandDispatcher(
	ctx: HostCommandContext,
): HostCommandDispatcher {
	const state: DispatcherState = {
		ctx,
		tail: Promise.resolve(),
		nextPath: null,
	};
	return (msg: unknown): void => {
		if (!isTypedMessage<HostCommandMessage>(msg)) return;
		const handler = COMMAND_HANDLERS[msg.type];
		if (handler === undefined) {
			console.warn(`${LOG_PREFIX} unknown host command type=${msg.type}`);
			return;
		}
		handler(msg, state);
	};
}
