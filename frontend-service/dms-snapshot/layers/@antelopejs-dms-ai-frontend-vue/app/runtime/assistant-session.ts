import type { InjectionKey, Ref, ShallowRef } from "vue";
import type { ChatApi } from "../chat/composables/useChangeSetActions";
import type { CurrentPage } from "../chat/types/conversation";
import type { ChatTransport } from "./chat-transport";
import type { PanelIntents } from "./panel-intents";
import type { SidecarStatus } from "./sidecar-status";

/**
 * Whether the assistant panel is open, and the ways to change it. The DMS owns
 * the state (`useSidePanel`): it remembers it in a cookie, renders the panel
 * docked next to the page, and the header launcher toggles it.
 */
export interface ChatPanelState {
	isOpen: Readonly<Ref<boolean>>;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

/**
 * The tab's assistant, as the plugin that owns it hands it to the panel, the
 * command palette's answer and the workspace pages: the sidecar's
 * reachability, the chat's side of the tab's stream, the panel's state, and
 * ways to open it on a chat.
 */
export interface AssistantSession {
	status: Readonly<Ref<SidecarStatus>>;
	chat: ChatTransport;
	panel: ChatPanelState;
	/** Opens a page of the dashboard, as its own links do. */
	navigate: (path: string) => void;
	/** Opens the panel on that conversation. */
	openConversation: (conversationId: string) => void;
	/** Opens the panel on a new conversation, the composer optionally prefilled. */
	startConversation: (prompt?: string) => void;
	/**
	 * Keeps the tab's stream open while the panel is closed, until the returned
	 * function releases it: the command palette's answer streams through it.
	 */
	holdStream: () => () => void;
	/** Requests waiting for an answer, across every chat. */
	pendingApprovals: Readonly<Ref<number>>;
	/** What the panel was asked to do and has not done yet. */
	intents: PanelIntents;
	/** The page the dashboard shows. */
	currentPage: Readonly<Ref<CurrentPage | null>>;
	/** The dashboard's authenticated requests, for the panel's own HTTP calls. */
	api: ChatApi;
	/** Why the sidecar last failed to start, when the backend knows. */
	lastError: Readonly<Ref<string | null>>;
	/** Asks the backend to restart the sidecar, then probes it again. */
	restart: () => Promise<void>;
}

/**
 * The tab's assistant session, provided from the start: `null` until the
 * sidecar answered its first probe, and for good when the assistant does not
 * run in this tab (production, a guest, the sidecar disabled).
 */
export type AssistantSessionRef = Readonly<ShallowRef<AssistantSession | null>>;

export const ASSISTANT_SESSION_KEY: InjectionKey<AssistantSessionRef> = Symbol(
	"dms-ai:assistant-session",
);
