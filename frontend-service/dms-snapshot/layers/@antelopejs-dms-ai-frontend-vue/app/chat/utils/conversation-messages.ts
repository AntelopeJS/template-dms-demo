import {
	MESSAGE_ROLES,
	STORED_ERROR_ROLE,
	STORED_TOOL_RESULT_ROLE,
	STORED_TOOL_USE_ROLE,
	TOOL_STATUS,
} from "../constants/conversation";
import type {
	AssistantMessage,
	BlockPreviewMessage,
	ConversationMessage,
	ErrorMessage,
	MessageAttachment,
	ToolCallMessage,
	ToolStatus,
	UserMessage,
} from "../types/conversation";
import type {
	BlockPreview,
	SnapshotMessage,
	ToolOutcome,
} from "../types/protocol";
import { newUuid } from "./ids";

const STOPPED_OUTCOME: ToolOutcome = "stopped";

const STATUS_BY_OUTCOME: Record<ToolOutcome, ToolStatus> = {
	done: TOOL_STATUS.SUCCESS,
	failed: TOOL_STATUS.ERROR,
	denied: TOOL_STATUS.ERROR,
	blocked: TOOL_STATUS.ERROR,
	stopped: TOOL_STATUS.ERROR,
};

export function buildUserMessage(
	content: string,
	attachments?: MessageAttachment[],
	pagePath?: string,
	timestampMs: number = Date.now(),
): UserMessage {
	return {
		id: newUuid(),
		role: MESSAGE_ROLES.USER,
		content,
		attachments,
		pagePath,
		timestampMs,
	};
}

export function buildAssistantMessage(
	content: string,
	timestampMs: number = Date.now(),
): AssistantMessage {
	return {
		id: newUuid(),
		role: MESSAGE_ROLES.ASSISTANT,
		content,
		timestampMs,
	};
}

export function buildErrorMessage(
	content: string,
	isRetryable: boolean,
	timestampMs: number = Date.now(),
): ErrorMessage {
	return {
		id: newUuid(),
		role: MESSAGE_ROLES.ERROR,
		content,
		isRetryable,
		timestampMs,
	};
}

/** An error the chat raises itself, translated when drawn. */
export function buildLocalError(
	contentKey: string,
	isRetryable = true,
): ErrorMessage {
	return {
		...buildErrorMessage("", isRetryable),
		contentKey,
		isLocal: true,
	};
}

export function buildBlockPreviewMessage(
	preview: BlockPreview,
): BlockPreviewMessage {
	return {
		id: newUuid(),
		role: MESSAGE_ROLES.BLOCK_PREVIEW,
		preview,
		timestampMs: preview.timestampMs,
	};
}

function normalizeToolStatus(raw: string | undefined): ToolStatus {
	if (raw === TOOL_STATUS.SUCCESS) return TOOL_STATUS.SUCCESS;
	if (raw === TOOL_STATUS.ERROR) return TOOL_STATUS.ERROR;
	return TOOL_STATUS.PENDING;
}

/** The status a closed call reports: its outcome's, else the wire status. */
export function closedStatus(
	outcome: ToolOutcome | undefined,
	status: string | undefined,
): ToolStatus {
	if (outcome !== undefined) return STATUS_BY_OUTCOME[outcome];
	const normalized = normalizeToolStatus(status);
	return normalized === TOOL_STATUS.PENDING ? TOOL_STATUS.SUCCESS : normalized;
}

function safeParse(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function isOpenTool(msg: ConversationMessage): msg is ToolCallMessage {
	return (
		msg.role === MESSAGE_ROLES.TOOL &&
		msg.outcome === undefined &&
		msg.status === TOOL_STATUS.PENDING
	);
}

/** Calls a finished turn left open: it ended before they did. */
export function settleOpenTools(
	list: ConversationMessage[],
): ConversationMessage[] {
	if (!list.some(isOpenTool)) return list;
	return list.map((msg) => {
		if (!isOpenTool(msg)) return msg;
		return { ...msg, status: TOOL_STATUS.ERROR, outcome: STOPPED_OUTCOME };
	});
}

interface SnapshotBuild {
	out: ConversationMessage[];
	toolByCallId: Map<string, ToolCallMessage>;
}

function toolFromUse(snap: SnapshotMessage): ToolCallMessage | null {
	if (snap.callId === undefined || snap.toolName === undefined) return null;
	return {
		id: newUuid(),
		role: MESSAGE_ROLES.TOOL,
		callId: snap.callId,
		toolName: snap.toolName,
		args: safeParse(snap.content),
		status: TOOL_STATUS.PENDING,
		allowedBy: snap.allowedBy,
		timestampMs: snap.timestampMs,
	};
}

function closeFromResult(tool: ToolCallMessage, snap: SnapshotMessage): void {
	tool.result = safeParse(snap.content);
	tool.status = closedStatus(snap.outcome, snap.status);
	tool.outcome = snap.outcome;
	tool.allowedBy = snap.allowedBy ?? tool.allowedBy;
	tool.changeSetId = snap.changeSetId;
	tool.endedAtMs = snap.timestampMs;
}

function addToolUse(build: SnapshotBuild, snap: SnapshotMessage): void {
	const tool = toolFromUse(snap);
	if (tool === null) return;
	build.out.push(tool);
	build.toolByCallId.set(tool.callId, tool);
}

function addToolResult(build: SnapshotBuild, snap: SnapshotMessage): void {
	if (snap.callId === undefined) return;
	const existing = build.toolByCallId.get(snap.callId);
	if (existing !== undefined) {
		closeFromResult(existing, snap);
		return;
	}
	const orphan = toolFromUse({ ...snap, toolName: snap.toolName ?? "" });
	if (orphan === null) return;
	closeFromResult(orphan, snap);
	build.out.push(orphan);
}

function addUser(build: SnapshotBuild, snap: SnapshotMessage): void {
	build.out.push(
		buildUserMessage(
			snap.content,
			snap.attachments,
			undefined,
			snap.timestampMs,
		),
	);
}

function addAssistant(build: SnapshotBuild, snap: SnapshotMessage): void {
	build.out.push(buildAssistantMessage(snap.content, snap.timestampMs));
}

function addError(build: SnapshotBuild, snap: SnapshotMessage): void {
	build.out.push(
		buildErrorMessage(snap.content, snap.isRetryable ?? true, snap.timestampMs),
	);
}

function addNotice(build: SnapshotBuild, snap: SnapshotMessage): void {
	if (snap.notice === undefined) return;
	build.out.push({
		id: newUuid(),
		role: MESSAGE_ROLES.NOTICE,
		notice: snap.notice,
		timestampMs: snap.timestampMs,
	});
}

function addChangeSet(build: SnapshotBuild, snap: SnapshotMessage): void {
	if (snap.changeSetId === undefined) return;
	build.out.push({
		id: newUuid(),
		role: MESSAGE_ROLES.CHANGE_SET,
		changeSetId: snap.changeSetId,
		timestampMs: snap.timestampMs,
	});
}

function addQuestionAnswer(build: SnapshotBuild, snap: SnapshotMessage): void {
	if (snap.answers === undefined || snap.answers.length === 0) return;
	build.out.push({
		id: newUuid(),
		role: MESSAGE_ROLES.QUESTION_ANSWER,
		answers: snap.answers,
		timestampMs: snap.timestampMs,
	});
}

function addBlockPreview(build: SnapshotBuild, snap: SnapshotMessage): void {
	if (snap.preview === undefined) return;
	build.out.push(buildBlockPreviewMessage(snap.preview));
}

const SNAPSHOT_BUILDERS: Record<
	string,
	(build: SnapshotBuild, snap: SnapshotMessage) => void
> = {
	[MESSAGE_ROLES.USER]: addUser,
	[MESSAGE_ROLES.ASSISTANT]: addAssistant,
	[STORED_ERROR_ROLE]: addError,
	[STORED_TOOL_USE_ROLE]: addToolUse,
	[STORED_TOOL_RESULT_ROLE]: addToolResult,
	[MESSAGE_ROLES.NOTICE]: addNotice,
	[MESSAGE_ROLES.CHANGE_SET]: addChangeSet,
	[MESSAGE_ROLES.QUESTION_ANSWER]: addQuestionAnswer,
	[MESSAGE_ROLES.BLOCK_PREVIEW]: addBlockPreview,
};

/**
 * The stored transcript as the chat draws it. Calls left open stay open: the
 * turn may be resuming, and the row tells running from stopped by whether it
 * is.
 */
export function snapshotToMessages(
	snapshot: readonly SnapshotMessage[],
): ConversationMessage[] {
	const build: SnapshotBuild = { out: [], toolByCallId: new Map() };
	for (const item of snapshot) SNAPSHOT_BUILDERS[item.role]?.(build, item);
	return build.out;
}
