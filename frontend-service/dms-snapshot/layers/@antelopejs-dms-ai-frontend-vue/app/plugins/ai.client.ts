import {
	type DmsAppContext,
	type DmsI18n,
	defineDmsPlugin,
	useDmsRouter,
} from "#dms/frontend-module";
import {
	computed,
	type Ref,
	readonly,
	ref,
	shallowRef,
	type ShallowRef,
	watch,
} from "vue";
import { CHAT_I18N_KEY, type ChatI18n } from "../chat/composables/useChatI18n";
import type { ChatApi } from "../chat/composables/useChangeSetActions";
import type { CurrentPage } from "../chat/types/conversation";
import {
	type AssistantActivity,
	type AssistantStatusPayload,
	createAssistantActivity,
} from "../runtime/assistant-activity";
import {
	launcherAction,
	paletteAssistant,
	paletteSource,
} from "../runtime/assistant-commands";
import { installAssistantNotifications } from "../runtime/assistant-notifications";
import {
	ASSISTANT_SESSION_KEY,
	type AssistantSession,
	type ChatPanelState,
} from "../runtime/assistant-session";
import {
	type ChannelClient,
	createChannelClient,
} from "../runtime/channel-client";
import {
	type ChatTransportHub,
	createChatTransport,
} from "../runtime/chat-transport";
import {
	CHANGES_PATH,
	CHANNEL_IDLE_STOP_MS,
	CHANNEL_STATUS_RECONNECTING,
	HELLO_MESSAGE_TYPE,
	HOST_ROLE,
	JSON_CONTENT_TYPE,
	RESTART_PATH,
	SIDECAR_INFO_PATH,
	SIDECAR_STATUS_CONNECTED,
	SIDECAR_STATUS_REVIVING,
	SIDE_PANEL_ID,
	STATUS_PATH,
	VISIBILITY_CHANGE_EVENT,
} from "../runtime/constants";
import {
	buildCurrentPageUpdate,
	installCurrentPageTracker,
} from "../runtime/current-page";
import { createFrameRouter } from "../runtime/frame-router";
import {
	createHostCommandDispatcher,
	type HostCommandDispatcher,
} from "../runtime/host-commands";
import { installNavigationCompleteEmitter } from "../runtime/navigation-complete";
import { createPanelIntents } from "../runtime/panel-intents";
import { runWhenLoggedIn } from "../runtime/session-gate";
import { installToggleShortcut } from "../runtime/shortcuts";
import {
	createSidecarStatusController,
	type SidecarInfoPayload,
	type SidecarStatus,
	type SidecarStatusController,
} from "../runtime/sidecar-status";
import { createStreamHolds, type StreamHolds } from "../runtime/stream-holds";

type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];
type Toaster = ReturnType<typeof useToast>;

interface ChannelDeps {
	$authFetch: AuthFetch;
	controller: SidecarStatusController;
	dispatchHostCommand: HostCommandDispatcher;
}

interface AssistantChannel {
	client: ChannelClient;
	chat: ChatTransportHub;
}

/** What the plugin takes from the DMS before its first await, while in context. */
interface DashboardDeps {
	$authFetch: AuthFetch;
	toaster: Toaster;
	devReload: ReturnType<typeof useDevReload>;
	router: ReturnType<typeof useDmsRouter>;
}

function postJson(
	$authFetch: AuthFetch,
	path: string,
	body?: unknown,
): Promise<unknown> {
	return $authFetch(path, {
		method: "POST",
		body: JSON.stringify(body ?? {}),
		headers: { "content-type": JSON_CONTENT_TYPE },
	});
}

function createAssistantChannel(deps: ChannelDeps): AssistantChannel {
	const chat = createChatTransport({
		send: (msg) => client.send(msg),
		reconnect: () => client.reconnectNow(),
		getStatus: () => client.getStatus(),
	});
	const client = createChannelClient({
		post: (path, body) => postJson(deps.$authFetch, path, body),
		onReady: () => {
			client.send({ type: HELLO_MESSAGE_TYPE, role: HOST_ROLE });
			client.send(buildCurrentPageUpdate(window.location.href));
			chat.announceReady();
		},
		onFrame: createFrameRouter({
			host: deps.dispatchHostCommand,
			chat: chat.deliver,
		}),
		onStatusChange: (status) => {
			chat.announceStatus(status);
			if (status === CHANNEL_STATUS_RECONNECTING)
				deps.controller.reportChannelDown();
		},
	});
	return { client, chat };
}

/** What keeps the tab's stream open. */
interface StreamNeeds {
	panel: ChatPanelState;
	activity: AssistantActivity;
	holds: StreamHolds;
}

/**
 * The stream is open while the panel is, while the tab shows a chat that
 * works or waits, so its events (and their toasts) still arrive, and while the
 * command palette streams an answer; otherwise it gives its connection back
 * shortly after.
 */
function followPanel(needs: StreamNeeds, client: ChannelClient): () => void {
	const { panel, activity, holds } = needs;
	let stopTimer: ReturnType<typeof setTimeout> | null = null;
	const clearStopTimer = (): void => {
		if (stopTimer !== null) clearTimeout(stopTimer);
		stopTimer = null;
	};
	const follow = (): void => {
		clearStopTimer();
		const isVisible = document.visibilityState === "visible";
		const isWanted =
			panel.isOpen.value || activity.isBusy.value || holds.isHeld.value;
		if (isVisible && isWanted) client.start();
		else stopTimer = setTimeout(() => client.stop(), CHANNEL_IDLE_STOP_MS);
	};
	const stopWatching = watch(
		[panel.isOpen, activity.isBusy, holds.isHeld],
		follow,
	);
	document.addEventListener(VISIBILITY_CHANGE_EVENT, follow);
	follow();
	return () => {
		clearStopTimer();
		stopWatching();
		document.removeEventListener(VISIBILITY_CHANGE_EVENT, follow);
	};
}

interface FollowedSidecarStatus {
	status: Readonly<Ref<SidecarStatus>>;
	stop: () => void;
}

function followSidecarStatus(
	controller: SidecarStatusController,
	client: ChannelClient,
): FollowedSidecarStatus {
	const status = ref<SidecarStatus>(controller.getStatus());
	// Only a sidecar coming back needs a fresh stream: replacing the one that
	// just opened would re-attach every chat and replay its running turn.
	const stop = controller.subscribe((next) => {
		if (
			next === SIDECAR_STATUS_CONNECTED &&
			status.value === SIDECAR_STATUS_REVIVING
		)
			client.reconnectNow();
		status.value = next;
	});
	return { status: readonly(status), stop };
}

function installHostState(
	client: ChannelClient,
	currentPage: Ref<CurrentPage | null>,
): () => void {
	const sendWhenConnected = (msg: unknown): void => {
		if (!client.isConnected()) return;
		client.send(msg);
	};
	const stopTracking = installCurrentPageTracker({
		send: (msg) => {
			currentPage.value = msg.currentPage;
			sendWhenConnected(msg);
		},
	});
	const stopNavigation = installNavigationCompleteEmitter({
		send: sendWhenConnected,
	});
	return () => {
		stopTracking();
		stopNavigation();
	};
}

function createChatI18n(i18n: DmsI18n): ChatI18n {
	return {
		t: (key, params, plural) =>
			plural === undefined
				? i18n.t(key, params ?? {})
				: i18n.t(key, params ?? {}, plural),
		locale: computed(() => String(i18n.locale.value)),
	};
}

function createApi($authFetch: AuthFetch): ChatApi {
	return {
		get: <T>(path: string) => $authFetch(path) as Promise<T>,
		post: <T>(path: string, body?: unknown) =>
			postJson($authFetch, path, body) as Promise<T>,
	};
}

interface SessionParts {
	deps: DashboardDeps;
	controller: SidecarStatusController;
	chat: ChatTransportHub;
	panel: ChatPanelState;
	holds: StreamHolds;
	status: Readonly<Ref<SidecarStatus>>;
	activity: AssistantActivity;
	currentPage: Ref<CurrentPage | null>;
}

function createSession(parts: SessionParts): AssistantSession {
	const { deps, panel, activity } = parts;
	const intents = createPanelIntents();
	return {
		status: parts.status,
		chat: parts.chat.transport,
		panel,
		navigate: (path) => void deps.router.push(path),
		openConversation: (conversationId) => {
			intents.push({ kind: "open", conversationId });
			panel.open();
		},
		startConversation: (prompt) => {
			intents.push({ kind: "start", prompt });
			panel.open();
		},
		holdStream: parts.holds.hold,
		pendingApprovals: activity.pendingApprovals,
		intents,
		currentPage: readonly(parts.currentPage),
		api: createApi(deps.$authFetch),
		lastError: activity.lastError,
		restart: async () => {
			try {
				await postJson(deps.$authFetch, RESTART_PATH);
			} finally {
				parts.controller.retry();
				void activity.refresh();
			}
		},
	};
}

function registerDashboardEntries(
	session: AssistantSession,
	i18n: ChatI18n,
): () => void {
	const register = (): void => registerHeaderAction(launcherAction(i18n.t));
	register();
	const stopWatchingLocale = watch(i18n.locale, register);
	registerCommandPaletteSource(
		paletteSource(i18n.t, session.pendingApprovals, {
			ask: () => {
				session.intents.push({ kind: "focus" });
				session.panel.open();
			},
			startConversation: () => session.startConversation(),
			reviewApprovals: () => {
				session.intents.push({ kind: "approvals" });
				session.panel.open();
			},
			openChanges: () => session.navigate(CHANGES_PATH),
		}),
	);
	registerCommandPaletteAssistant(
		paletteAssistant(i18n.t, session.currentPage),
	);
	return stopWatchingLocale;
}

function installToasts(
	session: AssistantSession,
	i18n: ChatI18n,
	toaster: Toaster,
): () => void {
	return installAssistantNotifications({
		chat: session.chat,
		isPanelOpen: session.panel.isOpen,
		pendingApprovals: session.pendingApprovals,
		t: i18n.t,
		toast: (input) => void toaster.add(input),
		reviewApprovals: (conversationId) => {
			if (conversationId !== undefined)
				session.openConversation(conversationId);
			session.intents.push({ kind: "approvals" });
			session.panel.open();
		},
		undoChangeSet: (set) =>
			session.chat.send({
				type: "change_set_action",
				conversationId: set.conversationId,
				changeSetId: set.id,
				action: "undo",
			}),
		reviewChangeSet: (id) =>
			session.navigate(`${CHANGES_PATH}?set=${encodeURIComponent(id)}`),
	});
}

/**
 * The launcher and the palette entries join the dashboard only once the app is
 * mounted: the server renders neither, and anything added before hydration
 * would make the client's tree, and the ids its tooltips and menus draw,
 * differ from the server's. The panel itself is registered on the server too
 * (`side-panel.ts`).
 */
function registerOnceMounted(
	context: DmsAppContext,
	appMounted: Promise<void>,
	session: AssistantSession,
	i18n: ChatI18n,
): () => void {
	let stop: (() => void) | null = null;
	let isActive = true;
	void appMounted.then(() => {
		if (!isActive) return;
		context.runWithContext(() => {
			stop = registerDashboardEntries(session, i18n);
		});
	});
	return () => {
		isActive = false;
		stop?.();
	};
}

/** What the plugin provides the app before the assistant runs. */
interface ProvidedAssistant {
	session: ShallowRef<AssistantSession | null>;
	i18n: ChatI18n;
}

interface AssistantRuntime {
	session: AssistantSession;
	stops: Array<() => void>;
}

function createRuntime(
	deps: DashboardDeps,
	controller: SidecarStatusController,
): AssistantRuntime {
	const dispatchHostCommand = createHostCommandDispatcher({
		router: deps.router,
		devReload: deps.devReload,
	});
	const { client, chat } = createAssistantChannel({
		$authFetch: deps.$authFetch,
		controller,
		dispatchHostCommand,
	});
	const panel: ChatPanelState = useSidePanel(SIDE_PANEL_ID);
	const holds = createStreamHolds();
	const sidecarStatus = followSidecarStatus(controller, client);
	const activity = createAssistantActivity({
		// The application's read: polled for as long as the app runs, while
		// the interval says so.
		readStatus: (interval) =>
			useApiData<AssistantStatusPayload>(STATUS_PATH, {
				refreshInterval: interval,
				refreshOnPageRefresh: false,
			}),
		chat: chat.transport,
		shouldPoll: () =>
			!panel.isOpen.value ||
			sidecarStatus.status.value !== SIDECAR_STATUS_CONNECTED,
	});
	const currentPage = ref<CurrentPage | null>(null);
	const session = createSession({
		deps,
		controller,
		chat,
		panel,
		holds,
		status: sidecarStatus.status,
		activity,
		currentPage,
	});
	const stops = [
		installToggleShortcut({ onToggle: panel.toggle }),
		followPanel({ panel, activity, holds }, client),
		installHostState(client, currentPage),
		sidecarStatus.stop,
		activity.stop,
		controller.dispose,
		client.stop,
	];
	return { session, stops };
}

interface WireOptions {
	context: DmsAppContext;
	appMounted: Promise<void>;
	provided: ProvidedAssistant;
	toaster: Toaster;
}

function wireAssistant(
	options: WireOptions,
	runtime: AssistantRuntime,
): () => void {
	const { context, appMounted, provided } = options;
	const { session } = runtime;
	provided.session.value = session;
	const stops = [
		registerOnceMounted(context, appMounted, session, provided.i18n),
		installToasts(session, provided.i18n, options.toaster),
		...runtime.stops,
	];
	return () => {
		provided.session.value = null;
		stops.forEach((stop) => stop());
	};
}

async function startAssistant(
	context: DmsAppContext,
	appMounted: Promise<void>,
	provided: ProvidedAssistant,
): Promise<void> {
	const deps: DashboardDeps = {
		$authFetch: useAuthFetch().$authFetch,
		toaster: useToast(),
		devReload: useDevReload(),
		router: useDmsRouter(),
	};
	// Read once the gate opens, then polled while the sidecar comes back.
	const controller = createSidecarStatusController((interval) =>
		useApiData<SidecarInfoPayload>(SIDECAR_INFO_PATH, {
			immediate: false,
			refreshInterval: interval,
			refreshOnPageRefresh: false,
		}),
	);
	if (!(await controller.init())) {
		context.runWithContext(() => unregisterSidePanel(SIDE_PANEL_ID));
		return;
	}
	const teardown = context.runWithContext(() =>
		wireAssistant(
			{ context, appMounted, provided, toaster: deps.toaster },
			createRuntime(deps, controller),
		),
	);
	context.vueApp.onUnmount(teardown);
	import.meta.hot?.dispose(teardown);
}

/**
 * The assistant appears for a signed-in owner in development only: a first
 * probe that finds no dms-ai backend, or a disabled sidecar, leaves no trace.
 * The session is provided at once, empty until that probe answers, so the
 * panel the server rendered open and the workspace pages follow it.
 */
export default defineDmsPlugin((context) => {
	if (!import.meta.env.DEV) return;
	const provided: ProvidedAssistant = {
		session: shallowRef<AssistantSession | null>(null),
		i18n: createChatI18n(context.$i18n),
	};
	context.vueApp.provide(ASSISTANT_SESSION_KEY, provided.session);
	context.vueApp.provide(CHAT_I18N_KEY, provided.i18n);
	const appMounted = new Promise<void>((resolve) =>
		context.hook("app:mounted", resolve),
	);
	const { loggedIn } = useDmsUserSession();
	const stopGate = runWhenLoggedIn(
		() => loggedIn.value,
		() =>
			void context.runWithContext(() =>
				startAssistant(context, appMounted, provided),
			),
	);
	context.vueApp.onUnmount(stopGate);
});
