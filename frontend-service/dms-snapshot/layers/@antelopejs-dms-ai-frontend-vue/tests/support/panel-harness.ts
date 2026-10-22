import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { vi } from "vitest";
import { defineComponent, h, nextTick, readonly, ref, shallowRef } from "vue";
import ChatPanel from "../../app/components/ChatPanel.vue";
import {
	ASSISTANT_SESSION_KEY,
	type AssistantSession,
	type ChatPanelState,
} from "../../app/runtime/assistant-session";
import type { ChannelStatus } from "../../app/runtime/channel-client";
import {
	type ChatTransportHub,
	createChatTransport,
} from "../../app/runtime/chat-transport";
import { createPanelIntents } from "../../app/runtime/panel-intents";
import { CHAT_I18N_KEY } from "../../app/chat/composables/useChatI18n";
import { createTestI18n } from "./i18n";
import { PANEL_STUBS } from "./stubs";
import type { SidecarStatus } from "../../app/runtime/sidecar-status";

export const CONVERSATION_ID = "conv-native-1";

/** A panel mounted on a fake stream: what it sent, and handles to drive it. */
export interface Harness {
	session: AssistantSession;
	hub: ChatTransportHub;
	sent: Array<Record<string, unknown>>;
	reconnects: number;
	sidecarStatus: ReturnType<typeof ref<SidecarStatus>>;
	setChannelStatus: (status: ChannelStatus) => void;
	navigate: ReturnType<typeof vi.fn>;
	restart: ReturnType<typeof vi.fn>;
	lastError: ReturnType<typeof ref<string | null>>;
	api: AssistantSession["api"];
	/** How many holds keep the tab's stream open. */
	streamHolds: number;
}

/**
 * What the DMS's `useSidePanel` hands the plugin: the open state it keeps in
 * its cookie, and the ways to change it.
 */
export function createSidePanel(): ChatPanelState {
	const isOpen = ref(false);
	return {
		isOpen: readonly(isOpen),
		open: () => {
			isOpen.value = true;
		},
		close: () => {
			isOpen.value = false;
		},
		toggle: () => {
			isOpen.value = !isOpen.value;
		},
	};
}

export function createHarness(): Harness {
	let channelStatus: ChannelStatus = "connected";
	const harness = {
		sent: [] as Array<Record<string, unknown>>,
		reconnects: 0,
		sidecarStatus: ref<SidecarStatus>("connected"),
		navigate: vi.fn(),
		restart: vi.fn(async () => undefined),
		lastError: ref<string | null>(null),
		api: { get: vi.fn(async () => ({ conflicts: [] })), post: vi.fn() },
	} as unknown as Harness;
	harness.hub = createChatTransport({
		send: (msg) => {
			if (channelStatus !== "connected") return false;
			harness.sent.push(msg as Record<string, unknown>);
			return true;
		},
		reconnect: () => {
			harness.reconnects += 1;
		},
		getStatus: () => channelStatus,
	});
	harness.streamHolds = 0;
	harness.setChannelStatus = (status) => {
		channelStatus = status;
		harness.hub.announceStatus(status);
	};
	const panel = createSidePanel();
	const intents = createPanelIntents();
	harness.session = {
		status: harness.sidecarStatus,
		chat: harness.hub.transport,
		panel,
		navigate: harness.navigate,
		openConversation: (conversationId) => {
			intents.push({ kind: "open", conversationId });
			panel.open();
		},
		startConversation: (prompt) => {
			intents.push({ kind: "start", prompt });
			panel.open();
		},
		holdStream: () => {
			harness.streamHolds += 1;
			return () => {
				harness.streamHolds -= 1;
			};
		},
		pendingApprovals: ref(0),
		intents,
		currentPage: ref({
			path: "/sales/overview",
			title: "Sales overview · DMS",
		}),
		api: harness.api,
		lastError: harness.lastError,
		restart: harness.restart,
	};
	return harness;
}

let wrapper: VueWrapper | null = null;

/** Unmounts what the last test mounted. */
export function unmountPanel(): void {
	wrapper?.unmount();
	wrapper = null;
}

/**
 * The DMS's side panel host: the panel's component is mounted while the panel
 * is open, and unmounted when it closes.
 */
function sidePanelHost(panel: ChatPanelState) {
	return defineComponent({
		setup: () => () =>
			h("aside", { "data-dms-side-panel": "" }, [
				panel.isOpen.value ? h(ChatPanel) : null,
			]),
	});
}

/** The providers the plugin installs, as a test mounts them. */
export function providedSession(session: AssistantSession | null) {
	return {
		[ASSISTANT_SESSION_KEY as symbol]: shallowRef(session),
		[CHAT_I18N_KEY as symbol]: createTestI18n(),
	};
}

function mountPanel(harness: Harness): VueWrapper {
	wrapper = mount(sidePanelHost(harness.session.panel), {
		attachTo: document.body,
		global: {
			provide: providedSession(harness.session),
			stubs: PANEL_STUBS,
		},
	});
	return wrapper;
}

export async function openPanel(harness: Harness): Promise<VueWrapper> {
	const mounted = mountPanel(harness);
	harness.session.panel.open();
	await nextTick();
	await flushPromises();
	return mounted;
}

/** A sidecar event for the panel's conversation. */
export function deliver(
	harness: Harness,
	event: Record<string, unknown>,
): void {
	harness.hub.deliver({ conversationId: CONVERSATION_ID, ...event });
}

export function sentOfType(harness: Harness, type: string) {
	return harness.sent.filter((msg) => msg.type === type);
}

export async function sendMessage(
	panel: VueWrapper,
	text: string,
): Promise<void> {
	await panel.find("textarea").setValue(text);
	await panel.find("form.composer").trigger("submit");
}

/** The first button whose text contains `label`. */
export function buttonWithText(
	root: VueWrapper | ReturnType<VueWrapper["find"]>,
	label: string,
) {
	const button = root
		.findAll("button")
		.find((item) => item.text().includes(label));
	if (button === undefined) throw new Error(`no button "${label}"`);
	return button;
}
