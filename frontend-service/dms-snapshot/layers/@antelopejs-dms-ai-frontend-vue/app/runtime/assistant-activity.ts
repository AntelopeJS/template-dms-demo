import { computed, type ComputedRef, type Ref, ref, watch } from "vue";
import type { ChatTransport } from "./chat-transport";
import { STATUS_POLL_MS } from "./constants";
import { isTypedMessage } from "./typed-message";

/** The backend's `/ai/status`, as far as the tab reads it. */
export interface AssistantStatusPayload {
	pendingApprovals?: number;
	workingConversations?: number;
	lastError?: string;
}

interface ConversationListItem {
	isRunning?: boolean;
	pendingApprovals?: number;
}

interface ConversationListFrame {
	type: "conversation_list";
	conversations?: ConversationListItem[];
}

const CONVERSATION_LIST_TYPE = "conversation_list";

export interface AssistantActivity {
	/** Requests waiting for an answer, across every chat. */
	pendingApprovals: Readonly<Ref<number>>;
	/** Chats running a turn now. */
	workingConversations: Readonly<Ref<number>>;
	/** A chat works or waits: the stream is worth keeping while the tab shows. */
	isBusy: ComputedRef<boolean>;
	lastError: Readonly<Ref<string | null>>;
	/** Re-reads the backend's status now. */
	refresh: () => Promise<void>;
	stop: () => void;
}

/** The read of the backend's status: `useApiData`, polled every `interval`. */
export interface AssistantStatusRead {
	data: Readonly<Ref<AssistantStatusPayload | null>>;
	refresh: () => Promise<void>;
}

/**
 * Opens the status read, polled every `interval` ms while it is above 0 and
 * not polled while it is 0.
 */
export type OpenAssistantStatusRead = (
	interval: () => number,
) => AssistantStatusRead;

export interface AssistantActivityOptions {
	readStatus: OpenAssistantStatusRead;
	chat: ChatTransport;
	/** Whether polling is useful now: the panel is closed, or its stream is down. */
	shouldPoll: () => boolean;
}

function isListFrame(msg: object): msg is ConversationListFrame {
	return isTypedMessage(msg) && msg.type === CONVERSATION_LIST_TYPE;
}

function sum(
	items: ConversationListItem[],
	read: (item: ConversationListItem) => number,
): number {
	return items.reduce((total, item) => total + read(item), 0);
}

/**
 * What the tab knows of the assistant's work across chats, from the backend's
 * status (polled while the panel is closed or its stream down: the polling
 * follows `shouldPoll`) and from the conversation lists the sidecar
 * broadcasts while the stream is open.
 */
export function createAssistantActivity(
	options: AssistantActivityOptions,
): AssistantActivity {
	const pendingApprovals = ref(0);
	const workingConversations = ref(0);
	const lastError = ref<string | null>(null);

	const isStopped = ref(false);
	const status = options.readStatus(() =>
		!isStopped.value && options.shouldPoll() ? STATUS_POLL_MS : 0,
	);
	// A failed read keeps the last answer: the counts stay as they were.
	const stopFollowing = watch(
		status.data,
		(payload) => {
			if (!payload) return;
			pendingApprovals.value = payload.pendingApprovals ?? 0;
			workingConversations.value = payload.workingConversations ?? 0;
			lastError.value = payload.lastError ?? null;
		},
		{ immediate: true },
	);

	const stopListening = options.chat.onMessage((msg) => {
		if (!isListFrame(msg)) return;
		const items = msg.conversations ?? [];
		pendingApprovals.value = sum(items, (item) => item.pendingApprovals ?? 0);
		workingConversations.value = sum(items, (item) =>
			item.isRunning === true ? 1 : 0,
		);
	});

	return {
		pendingApprovals,
		workingConversations,
		isBusy: computed(
			() => pendingApprovals.value > 0 || workingConversations.value > 0,
		),
		lastError,
		refresh: () => status.refresh(),
		stop: () => {
			isStopped.value = true;
			stopFollowing();
			stopListening();
		},
	};
}
