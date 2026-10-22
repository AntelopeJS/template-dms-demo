import {
	type BackoffState,
	createBackoff,
	nextDelay,
	resetBackoff,
} from "./backoff";
import {
	CHANNEL_EVENT_FRAME,
	CHANNEL_EVENT_READY,
	CHANNEL_EVENTS_PATH,
	CHANNEL_MESSAGES_SEGMENT,
	CHANNEL_PATH,
	CHANNEL_RECONNECT_DELAYS_MS,
	CHANNEL_STATUS_CONNECTED,
	CHANNEL_STATUS_CONNECTING,
	CHANNEL_STATUS_DISCONNECTED,
	CHANNEL_STATUS_RECONNECTING,
	EVENT_STREAM_TYPE,
} from "./constants";
import { readEventStream, type StreamEvent } from "./event-stream";

export type ChannelStatus =
	| typeof CHANNEL_STATUS_CONNECTING
	| typeof CHANNEL_STATUS_CONNECTED
	| typeof CHANNEL_STATUS_DISCONNECTED
	| typeof CHANNEL_STATUS_RECONNECTING;

/** Posts one message as JSON; `$authFetch` in the dashboard refreshes a stale session. */
type PostMessage = (path: string, body: unknown) => Promise<unknown>;

/** Opens the tab's event stream. */
type OpenStream = (path: string, signal: AbortSignal) => Promise<Response>;

export interface ChannelClientOptions {
	post: PostMessage;
	openStream?: OpenStream;
	/** Every connection is a new sidecar socket: identify on it here. */
	onReady?: () => void;
	/** Raw sidecar frame, as the socket delivered it. */
	onFrame?: (raw: string) => void;
	onStatusChange?: (status: ChannelStatus) => void;
}

export interface ChannelClient {
	/**
	 * Queued and posted one at a time, in order. False when it was dropped
	 * because the stream is not connected, so the caller knows nothing left.
	 */
	send: (msg: unknown) => boolean;
	isConnected: () => boolean;
	getStatus: () => ChannelStatus;
	/** Opens the stream if it is not open yet. */
	start: () => void;
	/** Closes the stream until the next `start`. */
	stop: () => void;
	/**
	 * Drops any pending backoff and replaces the stream at once, if started.
	 * The status says connecting until the new stream is ready, since nothing
	 * can be sent in between.
	 */
	reconnectNow: () => void;
}

interface ReadyPayload {
	connectionId?: unknown;
}

interface ClientState {
	options: ChannelClientOptions;
	status: ChannelStatus;
	connectionId: string | null;
	stream: AbortController | null;
	retryTimer: ReturnType<typeof setTimeout> | null;
	queue: unknown[];
	isDraining: boolean;
	isStarted: boolean;
	backoff: BackoffState;
}

function channelMessagesPath(connectionId: string): string {
	return `${CHANNEL_PATH}/${encodeURIComponent(connectionId)}/${CHANNEL_MESSAGES_SEGMENT}`;
}

function openEventStream(path: string, signal: AbortSignal): Promise<Response> {
	return fetch(path, {
		headers: { accept: EVENT_STREAM_TYPE },
		credentials: "same-origin",
		cache: "no-store",
		signal,
	});
}

function setStatus(state: ClientState, next: ChannelStatus): void {
	if (state.status === next) return;
	state.status = next;
	state.options.onStatusChange?.(next);
}

function readConnectionId(data: string): string | null {
	try {
		const { connectionId } = JSON.parse(data) as ReadyPayload;
		return typeof connectionId === "string" ? connectionId : null;
	} catch {
		return null;
	}
}

function handleReady(state: ClientState, event: StreamEvent): void {
	state.connectionId = readConnectionId(event.data);
	resetBackoff(state.backoff);
	setStatus(state, CHANNEL_STATUS_CONNECTED);
	state.options.onReady?.();
}

function handleEvent(state: ClientState, event: StreamEvent): void {
	if (event.name === CHANNEL_EVENT_READY) return handleReady(state, event);
	if (event.name !== CHANNEL_EVENT_FRAME) return;
	state.options.onFrame?.(event.data);
}

function scheduleRetry(state: ClientState): void {
	if (state.retryTimer !== null) return;
	const delay = nextDelay(state.backoff, CHANNEL_RECONNECT_DELAYS_MS);
	state.retryTimer = setTimeout(() => {
		state.retryTimer = null;
		connect(state);
	}, delay);
}

function lose(state: ClientState): void {
	state.connectionId = null;
	state.queue = [];
	if (!state.isStarted) return;
	setStatus(state, CHANNEL_STATUS_RECONNECTING);
	scheduleRetry(state);
}

async function run(
	state: ClientState,
	controller: AbortController,
): Promise<void> {
	const open = state.options.openStream ?? openEventStream;
	try {
		const response = await open(CHANNEL_EVENTS_PATH, controller.signal);
		if (!response.ok || response.body === null) return;
		await readEventStream(response.body, (event) => handleEvent(state, event));
	} catch {
		return;
	} finally {
		if (!controller.signal.aborted) lose(state);
	}
}

function connect(state: ClientState): void {
	if (!state.isStarted) return;
	state.stream?.abort();
	state.connectionId = null;
	const controller = new AbortController();
	state.stream = controller;
	void run(state, controller);
}

function restart(state: ClientState): void {
	state.stream?.abort();
	lose(state);
}

async function drain(state: ClientState): Promise<void> {
	if (state.isDraining) return;
	state.isDraining = true;
	while (state.queue.length > 0 && state.connectionId !== null) {
		const next = state.queue.shift();
		try {
			await state.options.post(channelMessagesPath(state.connectionId), next);
		} catch {
			restart(state);
		}
	}
	state.isDraining = false;
}

function send(state: ClientState, msg: unknown): boolean {
	if (state.connectionId === null) return false;
	state.queue.push(msg);
	void drain(state);
	return true;
}

function clearRetry(state: ClientState): void {
	if (state.retryTimer !== null) clearTimeout(state.retryTimer);
	state.retryTimer = null;
}

function start(state: ClientState): void {
	if (state.isStarted) return;
	state.isStarted = true;
	resetBackoff(state.backoff);
	setStatus(state, CHANNEL_STATUS_CONNECTING);
	connect(state);
}

function stop(state: ClientState): void {
	if (!state.isStarted) return;
	state.isStarted = false;
	clearRetry(state);
	state.stream?.abort();
	state.connectionId = null;
	state.queue = [];
	setStatus(state, CHANNEL_STATUS_DISCONNECTED);
}

function reconnectNow(state: ClientState): void {
	if (!state.isStarted) return;
	clearRetry(state);
	resetBackoff(state.backoff);
	setStatus(state, CHANNEL_STATUS_CONNECTING);
	connect(state);
}

/**
 * The tab's one stream to the sidecar through the DMS, carrying the dashboard's
 * and the chat's frames alike, and sequential POSTs to send. Browsers keep at
 * most six HTTP/1.1 connections per origin, so a tab holds one such stream and
 * only while it needs it: the caller starts and stops it. While started, any
 * end of the stream — a sidecar that went down, a hot reload of dms-ai, a
 * network drop — reconnects with backoff, and each new connection is announced
 * through `onReady` so the caller identifies itself again.
 */
export function createChannelClient(
	options: ChannelClientOptions,
): ChannelClient {
	const state: ClientState = {
		options,
		status: CHANNEL_STATUS_DISCONNECTED,
		connectionId: null,
		stream: null,
		retryTimer: null,
		queue: [],
		isDraining: false,
		isStarted: false,
		backoff: createBackoff(),
	};
	return {
		send: (msg) => send(state, msg),
		isConnected: () => state.connectionId !== null,
		getStatus: () => state.status,
		start: () => start(state),
		stop: () => stop(state),
		reconnectNow: () => reconnectNow(state),
	};
}
