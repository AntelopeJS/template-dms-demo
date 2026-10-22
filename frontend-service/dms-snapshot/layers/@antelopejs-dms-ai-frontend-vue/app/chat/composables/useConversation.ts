import { type Ref, ref } from "vue";
import { LOCAL_ERROR_KEYS, MESSAGE_ROLES } from "../constants/conversation";
import { CLIENT_MESSAGE_TYPES } from "../constants/protocol";
import type {
	ConversationMessage,
	MessageAttachment,
	QueuedMessage,
	RunProgress,
	UserMessage,
} from "../types/conversation";
import type {
	ChangeSetSummary,
	ConversationModeState,
	QuestionAnswerRecord,
	WireAttachment,
} from "../types/protocol";
import type { PendingAttachment } from "../utils/attachments";
import { splitDataUrl } from "../utils/attachments";
import {
	buildLocalError,
	buildUserMessage,
	settleOpenTools,
} from "../utils/conversation-messages";
import { newUuid } from "../utils/ids";
import { dispatchConversationEvent } from "./conversation-events";

export interface UseConversationOptions {
	activeId: Ref<string>;
	/** Returns false when the message could not leave the chat. */
	send: (msg: object) => boolean;
	onMessage: (handler: (msg: unknown) => void) => () => void;
	/** The page the dashboard shows, stamped on the messages sent from it. */
	getPagePath?: () => string | undefined;
}

export interface UseConversationResult {
	messages: Ref<ConversationMessage[]>;
	isRunning: Ref<boolean>;
	queued: Ref<QueuedMessage[]>;
	/** What the running turn is doing, as last reported; null between turns. */
	progress: Ref<RunProgress | null>;
	/** Whether a turn is expected to report: sent, resumed, or reporting. */
	isTurnInFlight: Ref<boolean>;
	/** Local time of the last event the sidecar sent about this conversation. */
	lastEventAtMs: Ref<number>;
	/** The change sets of this conversation, by id. */
	changeSets: Ref<Record<string, ChangeSetSummary>>;
	/** The chat's own approval mode and scope; null until the sidecar says. */
	mode: Ref<ConversationModeState | null>;
	/** Tokens this chat has used so far; null until the sidecar says. */
	totalTokens: Ref<number | null>;
	sendUserMessage: (
		content: string,
		attachments?: PendingAttachment[],
		extra?: Record<string, unknown>,
	) => void;
	/**
	 * Runs the last turn again: the sidecar re-runs a stored message, the chat
	 * resends one that never left.
	 */
	retry: () => void;
	interrupt: () => void;
	recordAnswers: (answers: QuestionAnswerRecord[]) => void;
	reset: () => void;
}

/** Every piece of a conversation the event handlers write. */
export interface ConversationState {
	options: UseConversationOptions;
	messages: Ref<ConversationMessage[]>;
	isRunning: Ref<boolean>;
	queued: Ref<QueuedMessage[]>;
	progress: Ref<RunProgress | null>;
	isTurnInFlight: Ref<boolean>;
	lastEventAtMs: Ref<number>;
	changeSets: Ref<Record<string, ChangeSetSummary>>;
	mode: Ref<ConversationModeState | null>;
	totalTokens: Ref<number | null>;
	/**
	 * When the calls of the stored transcript started and ended. A re-attach
	 * replays the running turn's events, and the replayed calls take their
	 * times from here rather than from the moment of the replay.
	 */
	callTimes: Map<string, CallTimes>;
}

/** When a call started and, once it did, ended, in sidecar time. */
interface CallTimes {
	startedAtMs: number;
	endedAtMs?: number;
}

function appendMessage(
	state: ConversationState,
	message: ConversationMessage,
): void {
	state.messages.value = [...state.messages.value, message];
}

function appendLocalError(
	state: ConversationState,
	key: string,
	isRetryable = true,
): void {
	appendMessage(state, buildLocalError(key, isRetryable));
}

function expectTurn(state: ConversationState): void {
	state.isTurnInFlight.value = true;
	state.lastEventAtMs.value = Date.now();
}

function endTurn(state: ConversationState): void {
	state.messages.value = settleOpenTools(state.messages.value);
	state.progress.value = null;
	state.isTurnInFlight.value = false;
}

function toWireAttachments(attachments: PendingAttachment[]): WireAttachment[] {
	return attachments.map((a) => ({
		name: a.name,
		mimeType: a.mimeType,
		size: a.size,
		data: a.data,
	}));
}

function toLocalAttachments(
	attachments: PendingAttachment[],
): MessageAttachment[] | undefined {
	if (attachments.length === 0) return undefined;
	return attachments.map((a) => ({
		name: a.name,
		mimeType: a.mimeType,
		size: a.size,
		dataUrl: a.dataUrl,
	}));
}

function withWire(attachments: PendingAttachment[]): Record<string, unknown> {
	const wire = toWireAttachments(attachments);
	return wire.length > 0 ? { attachments: wire } : {};
}

function queueFollowUp(
	state: ConversationState,
	content: string,
	attachments: PendingAttachment[],
): void {
	const isQueued = state.options.send({
		type: CLIENT_MESSAGE_TYPES.QUEUE_ENQUEUE,
		conversationId: state.options.activeId.value,
		item: { id: newUuid(), content, ...withWire(attachments) },
	});
	if (!isQueued) appendLocalError(state, LOCAL_ERROR_KEYS.NOT_SENT);
}

function startTurn(
	state: ConversationState,
	content: string,
	attachments: PendingAttachment[],
	extra: Record<string, unknown>,
): void {
	const isSent = state.options.send({
		type: CLIENT_MESSAGE_TYPES.USER_MESSAGE,
		conversationId: state.options.activeId.value,
		content,
		...withWire(attachments),
		...extra,
	});
	state.messages.value = settleOpenTools(state.messages.value);
	const message = buildUserMessage(
		content,
		toLocalAttachments(attachments),
		state.options.getPagePath?.(),
	);
	appendMessage(state, isSent ? message : { ...message, isUnsent: true });
	if (!isSent) {
		appendLocalError(state, LOCAL_ERROR_KEYS.NOT_SENT);
		return;
	}
	state.isRunning.value = true;
	expectTurn(state);
}

function sendUserMessage(
	state: ConversationState,
	content: string,
	attachments: PendingAttachment[],
	extra: Record<string, unknown>,
): void {
	const trimmed = content.trim();
	if (trimmed.length === 0 && attachments.length === 0) return;
	if (state.isRunning.value) {
		queueFollowUp(state, trimmed, attachments);
		return;
	}
	startTurn(state, trimmed, attachments, extra);
}

function lastUserMessage(list: ConversationMessage[]): UserMessage | undefined {
	const users = list.filter(
		(msg): msg is UserMessage => msg.role === MESSAGE_ROLES.USER,
	);
	return users.at(-1);
}

function toResendableAttachments(
	attachments: MessageAttachment[] | undefined,
): PendingAttachment[] | null {
	const list = attachments ?? [];
	if (list.some((att) => !att.dataUrl)) return null;
	return list.map((att) => ({
		id: newUuid(),
		name: att.name,
		mimeType: att.mimeType,
		size: att.size,
		data: splitDataUrl(att.dataUrl ?? ""),
		dataUrl: att.dataUrl ?? "",
	}));
}

function resendLocally(state: ConversationState, last: UserMessage): void {
	const attachments = toResendableAttachments(last.attachments);
	if (attachments === null) {
		appendLocalError(state, LOCAL_ERROR_KEYS.RETRY_NEEDS_FILES, false);
		return;
	}
	state.messages.value = state.messages.value.filter(
		(msg) => msg.id !== last.id,
	);
	sendUserMessage(state, last.content, attachments, {});
}

function retry(state: ConversationState): void {
	const last = lastUserMessage(state.messages.value);
	if (last === undefined || state.isRunning.value) return;
	if (last.isUnsent === true) {
		resendLocally(state, last);
		return;
	}
	const isSent = state.options.send({
		type: CLIENT_MESSAGE_TYPES.RETRY_TURN,
		conversationId: state.options.activeId.value,
	});
	if (!isSent) {
		appendLocalError(state, LOCAL_ERROR_KEYS.NOT_SENT);
		return;
	}
	state.isRunning.value = true;
	expectTurn(state);
}

function interrupt(state: ConversationState): void {
	if (!state.isRunning.value) return;
	const isSent = state.options.send({
		type: CLIENT_MESSAGE_TYPES.INTERRUPT_TURN,
		conversationId: state.options.activeId.value,
	});
	if (isSent) return;
	endTurn(state);
	state.isRunning.value = false;
	appendLocalError(state, LOCAL_ERROR_KEYS.STOP_NOT_DELIVERED);
}

function recordAnswers(
	state: ConversationState,
	answers: QuestionAnswerRecord[],
): void {
	if (answers.length === 0) return;
	appendMessage(state, {
		id: newUuid(),
		role: MESSAGE_ROLES.QUESTION_ANSWER,
		answers,
		timestampMs: Date.now(),
	});
}

function reset(state: ConversationState): void {
	state.messages.value = [];
	state.isRunning.value = false;
	state.queued.value = [];
	state.progress.value = null;
	state.isTurnInFlight.value = false;
	state.changeSets.value = {};
	state.mode.value = null;
	state.totalTokens.value = null;
	state.callTimes.clear();
}

function createConversationState(
	options: UseConversationOptions,
): ConversationState {
	return {
		options,
		messages: ref<ConversationMessage[]>([]),
		isRunning: ref(false),
		queued: ref<QueuedMessage[]>([]),
		progress: ref<RunProgress | null>(null),
		isTurnInFlight: ref(false),
		lastEventAtMs: ref(Date.now()),
		changeSets: ref<Record<string, ChangeSetSummary>>({}),
		mode: ref<ConversationModeState | null>(null),
		totalTokens: ref<number | null>(null),
		callTimes: new Map(),
	};
}

/**
 * One conversation as the chat shows it: its transcript, its running turn,
 * its queue, change sets, mode and token count, all folded from the
 * sidecar's events for the active conversation.
 */
export function useConversation(
	options: UseConversationOptions,
): UseConversationResult {
	const state = createConversationState(options);
	options.onMessage((msg) => dispatchConversationEvent(state, msg));
	return {
		messages: state.messages,
		isRunning: state.isRunning,
		queued: state.queued,
		progress: state.progress,
		isTurnInFlight: state.isTurnInFlight,
		lastEventAtMs: state.lastEventAtMs,
		changeSets: state.changeSets,
		mode: state.mode,
		totalTokens: state.totalTokens,
		sendUserMessage: (content, attachments = [], extra = {}) =>
			sendUserMessage(state, content, attachments, extra),
		retry: () => retry(state),
		interrupt: () => interrupt(state),
		recordAnswers: (answers) => recordAnswers(state, answers),
		reset: () => reset(state),
	};
}
