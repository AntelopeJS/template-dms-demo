export const MESSAGE_ROLES = {
	USER: "user",
	ASSISTANT: "assistant",
	TOOL: "tool",
	ERROR: "error",
	NOTICE: "notice",
	CHANGE_SET: "change_set",
	QUESTION_ANSWER: "question_answer",
	BLOCK_PREVIEW: "block_preview",
} as const;

export const STORED_TOOL_USE_ROLE = "tool_use";
export const STORED_TOOL_RESULT_ROLE = "tool_result";
export const STORED_ERROR_ROLE = "error";

export const TOOL_STATUS = {
	PENDING: "pending",
	SUCCESS: "success",
	ERROR: "error",
} as const;

export const TODO_WRITE_TOOL_NAME = "TodoWrite";
export const EXIT_PLAN_MODE_TOOL_NAME = "ExitPlanMode";
/** A question asked from the command palette is answered read-only. */
export const PALETTE_TURN_MODE = {
	mode: "plan",
	generationMode: "safe",
} as const;
export const PLAN_ARG_KEY = "plan";

export const TODO_STATUS = {
	PENDING: "pending",
	IN_PROGRESS: "in_progress",
	COMPLETED: "completed",
} as const;

export const STORAGE_CONVERSATION_ID_KEY = "dms-ai-conversation-id";

export const SEND_HOTKEY = "Enter";
export const NEWLINE_HOTKEY_MODIFIER = "shiftKey";

/** Translation keys of the errors the chat itself raises. */
export const LOCAL_ERROR_KEYS = {
	NOT_SENT: "dms_ai.panel.errors.not_sent",
	RETRY_NEEDS_FILES: "dms_ai.panel.errors.retry_needs_files",
	STOP_NOT_DELIVERED: "dms_ai.panel.errors.stop_not_delivered",
} as const;

/**
 * A live cluster peeks only its most recent rows; the rest hide behind a
 * reveal.
 */
export const TOOL_CLUSTER_VISIBLE_LIMIT = 3;

/**
 * How long a cluster stays open after it stops being the active workspace, so
 * a fast hand-off to the next cluster doesn't flash.
 */
export const TOOL_CLUSTER_COLLAPSE_LINGER_MS = 600;

/** How long a deleted conversation can be brought back before it is deleted. */
export const DELETE_UNDO_MS = 8_000;
