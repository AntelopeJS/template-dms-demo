import { MESSAGE_ROLES } from "../constants/conversation";
import { SERVER_EVENT_TYPES } from "../constants/protocol";
import type {
	ConversationMessage,
	ToolCallMessage,
} from "../types/conversation";
import type {
	AllowedBy,
	AttachmentMeta,
	BlockPreview,
	ChangeSetSummary,
	ConversationModeState,
	FullAutoState,
	Notice,
	QueuedItemWire,
	SnapshotMessage,
	ToolOutcome,
	WireAttachment,
} from "../types/protocol";
import type { PendingAttachment } from "../utils/attachments";
import {
	buildAssistantMessage,
	buildBlockPreviewMessage,
	buildErrorMessage,
	buildUserMessage,
	closedStatus,
	settleOpenTools,
	snapshotToMessages,
} from "../utils/conversation-messages";
import { newUuid } from "../utils/ids";
import { toActivityKind } from "../utils/run-status";
import type { ConversationState } from "./useConversation";

interface ChunkEvent {
	text: string;
}

interface ToolStartEvent {
	callId: string;
	toolName: string;
	args: unknown;
}

interface ToolEndEvent {
	callId: string;
	status?: string;
	result: unknown;
	outcome?: ToolOutcome;
	allowedBy?: AllowedBy;
	changeSetId?: string;
}

interface RunErrorEvent {
	error: string;
	isRetryable?: boolean;
}

interface RunProgressEvent {
	activity: string;
	detail?: string;
	elapsedMs: number;
	idleMs: number;
}

interface SnapshotModeWire {
	mode?: ConversationModeState["mode"];
	generationMode?: ConversationModeState["generationMode"];
	fullAuto?: FullAutoState | null;
}

interface SnapshotEvent {
	messages?: SnapshotMessage[];
	changeSets?: ChangeSetSummary[];
	mode?: SnapshotModeWire;
	totalTokens?: number;
}

interface QueueStateEvent {
	items?: QueuedItemWire[];
}

interface UserMessageEchoEvent {
	content: string;
	attachments?: AttachmentMeta[];
	timestampMs?: number;
}

interface NoticeEvent {
	notice?: Notice;
}

interface ChangeSetEvent {
	changeSet?: ChangeSetSummary;
}

interface BlockPreviewEvent {
	preview?: BlockPreview;
}

interface UsageEvent {
	totalTokens?: number;
}

type EventHandler = (state: ConversationState, event: never) => void;

function setMessages(
	state: ConversationState,
	next: ConversationMessage[],
): void {
	state.messages.value = next;
}

function appendMessage(
	state: ConversationState,
	message: ConversationMessage,
): void {
	setMessages(state, [...state.messages.value, message]);
}

function endTurn(state: ConversationState): void {
	setMessages(state, settleOpenTools(state.messages.value));
	state.progress.value = null;
	state.isTurnInFlight.value = false;
	state.isRunning.value = state.queued.value.length > 0;
}

function appendChunk(state: ConversationState, event: ChunkEvent): void {
	const list = state.messages.value;
	const last = list.at(-1);
	if (last?.role !== MESSAGE_ROLES.ASSISTANT) {
		appendMessage(state, buildAssistantMessage(event.text));
		return;
	}
	setMessages(state, [
		...list.slice(0, -1),
		{ ...last, content: last.content + event.text },
	]);
}

function isCall(msg: ConversationMessage, callId: string): boolean {
	return msg.role === MESSAGE_ROLES.TOOL && msg.callId === callId;
}

function startTool(state: ConversationState, event: ToolStartEvent): void {
	const list = state.messages.value;
	if (list.some((msg) => isCall(msg, event.callId))) {
		setMessages(
			state,
			list.map((msg) =>
				isCall(msg, event.callId)
					? { ...msg, toolName: event.toolName, args: event.args }
					: msg,
			),
		);
		return;
	}
	const tool: ToolCallMessage = {
		id: newUuid(),
		role: MESSAGE_ROLES.TOOL,
		callId: event.callId,
		toolName: event.toolName,
		args: event.args,
		status: "pending",
		timestampMs: state.callTimes.get(event.callId)?.startedAtMs ?? Date.now(),
	};
	appendMessage(state, tool);
}

function endTool(state: ConversationState, event: ToolEndEvent): void {
	const endedAtMs = state.callTimes.get(event.callId)?.endedAtMs ?? Date.now();
	setMessages(
		state,
		state.messages.value.map((msg) => {
			if (!isCall(msg, event.callId) || msg.role !== MESSAGE_ROLES.TOOL)
				return msg;
			return {
				...msg,
				status: closedStatus(event.outcome, event.status),
				result: event.result,
				outcome: event.outcome,
				allowedBy: event.allowedBy ?? msg.allowedBy,
				changeSetId: event.changeSetId,
				endedAtMs,
			};
		}),
	);
}

function failRun(state: ConversationState, event: RunErrorEvent): void {
	endTurn(state);
	appendMessage(
		state,
		buildErrorMessage(event.error, event.isRetryable ?? true),
	);
}

function isTurnStart(msg: ConversationMessage): boolean {
	if (msg.role === MESSAGE_ROLES.USER) return true;
	return msg.role === MESSAGE_ROLES.NOTICE && msg.notice.kind === "autofix";
}

/** Kept through a replay: stored outside the turn's own events. */
function isOutOfTurn(msg: ConversationMessage): boolean {
	return (
		msg.role === MESSAGE_ROLES.NOTICE ||
		msg.role === MESSAGE_ROLES.QUESTION_ANSWER ||
		msg.role === MESSAGE_ROLES.BLOCK_PREVIEW
	);
}

/**
 * The transcript up to where the running turn began. A re-attach sends the
 * stored transcript, then `run_resumed` and every event of the running turn
 * from its start: the turn's stored part makes way for that replay, or its
 * texts would be appended twice.
 */
function withoutRunningTurn(
	list: ConversationMessage[],
): ConversationMessage[] {
	const start = lastIndexWhere(list, isTurnStart);
	return [
		...list.slice(0, start + 1),
		...list.slice(start + 1).filter(isOutOfTurn),
	];
}

function lastIndexWhere(
	list: ConversationMessage[],
	predicate: (msg: ConversationMessage) => boolean,
): number {
	for (let index = list.length - 1; index >= 0; index -= 1)
		if (predicate(list[index])) return index;
	return -1;
}

function resumeRun(state: ConversationState): void {
	setMessages(state, withoutRunningTurn(state.messages.value));
	state.isRunning.value = true;
	state.isTurnInFlight.value = true;
	state.lastEventAtMs.value = Date.now();
}

function reportProgress(
	state: ConversationState,
	event: RunProgressEvent,
): void {
	state.progress.value = {
		activity: toActivityKind(event.activity),
		detail: event.detail,
		elapsedMs: event.elapsedMs,
		idleMs: event.idleMs,
		receivedAtMs: Date.now(),
	};
	state.isRunning.value = true;
	state.isTurnInFlight.value = true;
}

function toModeState(wire: SnapshotModeWire | undefined) {
	if (wire?.mode === undefined || wire.generationMode === undefined)
		return null;
	return {
		mode: wire.mode,
		generationMode: wire.generationMode,
		fullAuto: wire.fullAuto ?? null,
	};
}

function byId(sets: readonly ChangeSetSummary[]) {
	return Object.fromEntries(sets.map((set) => [set.id, set]));
}

function rememberCallTimes(
	state: ConversationState,
	list: ConversationMessage[],
): void {
	state.callTimes.clear();
	for (const msg of list) {
		if (msg.role !== MESSAGE_ROLES.TOOL) continue;
		state.callTimes.set(msg.callId, {
			startedAtMs: msg.timestampMs,
			endedAtMs: msg.endedAtMs,
		});
	}
}

function applySnapshot(state: ConversationState, event: SnapshotEvent): void {
	const messages = snapshotToMessages(event.messages ?? []);
	rememberCallTimes(state, messages);
	setMessages(state, messages);
	state.changeSets.value = byId(event.changeSets ?? []);
	state.mode.value = toModeState(event.mode) ?? state.mode.value;
	state.totalTokens.value = event.totalTokens ?? state.totalTokens.value;
	state.isRunning.value = false;
	state.progress.value = null;
	state.isTurnInFlight.value = false;
}

function toPendingAttachment(wire: WireAttachment): PendingAttachment {
	return {
		id: newUuid(),
		name: wire.name,
		mimeType: wire.mimeType,
		size: wire.size,
		data: wire.data,
		dataUrl: `data:${wire.mimeType};base64,${wire.data}`,
	};
}

function applyQueue(state: ConversationState, event: QueueStateEvent): void {
	state.queued.value = (event.items ?? []).map((item) => ({
		id: item.id,
		content: item.content,
		attachments: (item.attachments ?? []).map(toPendingAttachment),
	}));
}

function echoUserMessage(
	state: ConversationState,
	event: UserMessageEchoEvent,
): void {
	const attachments = (event.attachments ?? []).map((meta) => ({ ...meta }));
	appendMessage(
		state,
		buildUserMessage(
			event.content,
			attachments.length > 0 ? attachments : undefined,
			undefined,
			event.timestampMs ?? Date.now(),
		),
	);
}

function applyMode(state: ConversationState, event: SnapshotModeWire): void {
	state.mode.value = toModeState(event) ?? state.mode.value;
}

function appendNotice(state: ConversationState, event: NoticeEvent): void {
	if (event.notice === undefined) return;
	appendMessage(state, {
		id: newUuid(),
		role: MESSAGE_ROLES.NOTICE,
		notice: event.notice,
		timestampMs: event.notice.timestampMs ?? Date.now(),
	});
}

function hasCardFor(state: ConversationState, changeSetId: string): boolean {
	return state.messages.value.some(
		(msg) =>
			msg.role === MESSAGE_ROLES.CHANGE_SET && msg.changeSetId === changeSetId,
	);
}

function applyChangeSet(state: ConversationState, event: ChangeSetEvent): void {
	const set = event.changeSet;
	if (set === undefined) return;
	state.changeSets.value = { ...state.changeSets.value, [set.id]: set };
	if (hasCardFor(state, set.id)) return;
	appendMessage(state, {
		id: newUuid(),
		role: MESSAGE_ROLES.CHANGE_SET,
		changeSetId: set.id,
		timestampMs: set.createdAtMs,
	});
}

function appendBlockPreview(
	state: ConversationState,
	event: BlockPreviewEvent,
): void {
	const preview = event.preview;
	if (preview === undefined) return;
	const isKnown = state.messages.value.some(
		(msg) =>
			msg.role === MESSAGE_ROLES.BLOCK_PREVIEW && msg.preview.id === preview.id,
	);
	if (isKnown) return;
	appendMessage(state, buildBlockPreviewMessage(preview));
}

function applyUsage(state: ConversationState, event: UsageEvent): void {
	if (typeof event.totalTokens !== "number") return;
	state.totalTokens.value = event.totalTokens;
}

const EVENT_HANDLERS: Record<string, EventHandler> = {
	[SERVER_EVENT_TYPES.ASSISTANT_MESSAGE_CHUNK]: appendChunk,
	[SERVER_EVENT_TYPES.TOOL_CALL_START]: startTool,
	[SERVER_EVENT_TYPES.TOOL_CALL_END]: endTool,
	[SERVER_EVENT_TYPES.RUN_DONE]: endTurn,
	[SERVER_EVENT_TYPES.RUN_ERROR]: failRun,
	[SERVER_EVENT_TYPES.RUN_RESUMED]: resumeRun,
	[SERVER_EVENT_TYPES.RUN_PROGRESS]: reportProgress,
	[SERVER_EVENT_TYPES.CONVERSATION_SNAPSHOT]: applySnapshot,
	[SERVER_EVENT_TYPES.QUEUE_STATE]: applyQueue,
	[SERVER_EVENT_TYPES.USER_MESSAGE_ECHO]: echoUserMessage,
	[SERVER_EVENT_TYPES.CONVERSATION_MODE]: applyMode,
	[SERVER_EVENT_TYPES.NOTICE]: appendNotice,
	[SERVER_EVENT_TYPES.CHANGE_SET]: applyChangeSet,
	[SERVER_EVENT_TYPES.USAGE]: applyUsage,
	[SERVER_EVENT_TYPES.BLOCK_PREVIEW]: appendBlockPreview,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function isForActive(
	state: ConversationState,
	msg: Record<string, unknown>,
): boolean {
	const id = msg.conversationId;
	return typeof id !== "string" || id === state.options.activeId.value;
}

/** Folds one sidecar event into the active conversation; others are ignored. */
export function dispatchConversationEvent(
	state: ConversationState,
	msg: unknown,
): void {
	if (!isRecord(msg) || typeof msg.type !== "string") return;
	const handler = EVENT_HANDLERS[msg.type];
	if (handler === undefined || !isForActive(state, msg)) return;
	state.lastEventAtMs.value = Date.now();
	handler(state, msg as never);
}
