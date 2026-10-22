import type { ACTIVITY_KINDS } from "../constants/run-status";
import type { PendingAttachment } from "../utils/attachments";
import type {
	AllowedBy,
	BlockPreview,
	Notice,
	ProviderName,
	QuestionAnswerRecord,
	Scope,
	ToolOutcome,
} from "./protocol";

export type ToolStatus = "pending" | "success" | "error";
export type ActivityKind = (typeof ACTIVITY_KINDS)[keyof typeof ACTIVITY_KINDS];

/**
 * What a tool row shows. `waiting` and `running` are derived by the chat (an
 * open call, with or without a pending request); the rest come from the
 * sidecar's `outcome`.
 */
export type ToolRowState =
	| "done"
	| "running"
	| "waiting"
	| "denied"
	| "blocked"
	| "failed"
	| "stopped";

/**
 * A file attached to a user message. `dataUrl` is only present for messages
 * sent in this session (drives the image thumbnail); after a reload the
 * snapshot carries just the metadata, so it is absent.
 */
export interface MessageAttachment {
	name: string;
	mimeType: string;
	size: number;
	dataUrl?: string;
}

export interface UserMessage {
	id: string;
	role: "user";
	content: string;
	attachments?: MessageAttachment[];
	isUnsent?: boolean;
	/** The page the message was sent from, known for messages of this session. */
	pagePath?: string;
	timestampMs: number;
}

export interface AssistantMessage {
	id: string;
	role: "assistant";
	content: string;
	timestampMs: number;
}

/** Why a run stopped or a message could not be sent, with a way to retry. */
export interface ErrorMessage {
	id: string;
	role: "error";
	content: string;
	/** Set for the chat's own errors: translated at render time. */
	contentKey?: string;
	isRetryable: boolean;
	/** True when only this tab knows of it: a retry resends locally. */
	isLocal?: boolean;
	timestampMs: number;
}

export interface NoticeMessage {
	id: string;
	role: "notice";
	notice: Notice;
	timestampMs: number;
}

/** Where a turn's change set is drawn: its summary lives in the change set map. */
export interface ChangeSetMessage {
	id: string;
	role: "change_set";
	changeSetId: string;
	timestampMs: number;
}

export interface QuestionAnswerMessage {
	id: string;
	role: "question_answer";
	answers: QuestionAnswerRecord[];
	timestampMs: number;
}

/** A block preview the agent shared, drawn as an attachment card. */
export interface BlockPreviewMessage {
	id: string;
	role: "block_preview";
	preview: BlockPreview;
	timestampMs: number;
}

/**
 * What the running turn is doing, as last reported by the sidecar.
 * `receivedAtMs` is the local time of that report, from which the elapsed and
 * quiet durations keep counting until the next one.
 */
export interface RunProgress {
	activity: ActivityKind;
	detail?: string;
	elapsedMs: number;
	idleMs: number;
	receivedAtMs: number;
}

export interface ToolCallMessage {
	id: string;
	role: "tool";
	callId: string;
	toolName: string;
	args: unknown;
	result?: unknown;
	status: ToolStatus;
	outcome?: ToolOutcome;
	allowedBy?: AllowedBy;
	changeSetId?: string;
	timestampMs: number;
	endedAtMs?: number;
}

export type ConversationMessage =
	| UserMessage
	| AssistantMessage
	| ToolCallMessage
	| ErrorMessage
	| NoticeMessage
	| ChangeSetMessage
	| QuestionAnswerMessage
	| BlockPreviewMessage;

export interface QueuedMessage {
	id: string;
	content: string;
	attachments: PendingAttachment[];
}

export interface ConversationSummary {
	id: string;
	title: string;
	createdAtMs: number;
	updatedAtMs: number;
	messageCount: number;
	provider?: ProviderName;
	totalTokens?: number;
	filesChanged?: number;
	filesUndone?: number;
	isRunning?: boolean;
	pendingApprovals?: number;
	pendingQuestions?: number;
	generationMode?: Scope;
}

/** The page the dashboard shows, which the composer's chip names. */
export interface CurrentPage {
	path: string;
	title?: string;
}
