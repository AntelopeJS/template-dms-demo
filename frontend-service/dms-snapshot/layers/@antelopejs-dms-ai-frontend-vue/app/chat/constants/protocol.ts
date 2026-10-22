export const CLIENT_MESSAGE_TYPES = {
	HELLO: "hello",
	USER_MESSAGE: "user_message",
	PERMISSION_RESPONSE: "permission_response",
	QUESTION_RESPONSE: "question_response",
	LIST_CONVERSATIONS: "list_conversations",
	DELETE_CONVERSATION: "delete_conversation",
	SET_SETTINGS: "set_settings",
	INTERRUPT_TURN: "interrupt_turn",
	QUEUE_ENQUEUE: "queue_enqueue",
	QUEUE_CANCEL: "queue_cancel",
	QUEUE_UPDATE: "queue_update",
	QUEUE_MOVE: "queue_move",
	QUEUE_CLEAR: "queue_clear",
	REVOKE_RULE: "revoke_rule",
	SET_CONVERSATION_MODE: "set_conversation_mode",
	LEAVE_CONVERSATION: "leave_conversation",
	STOP_AUTOFIX: "stop_autofix",
	RETRY_TURN: "retry_turn",
	CHANGE_SET_ACTION: "change_set_action",
} as const;

/**
 * Pages of the dms-ai module the chat links to. Module pages live under
 * `/modules/<moduleId>/<slug>`.
 */
export const SETTINGS_PAGE_PATH = "/modules/ai/settings";
export const CHANGES_PAGE_PATH = "/modules/ai/changes";
export const ACTIVITY_PAGE_PATH = "/modules/ai/activity";
export const CHANGE_SET_QUERY_KEY = "set";

export const SERVER_EVENT_TYPES = {
	ASSISTANT_MESSAGE_CHUNK: "assistant_message_chunk",
	TOOL_CALL_START: "tool_call_start",
	TOOL_CALL_END: "tool_call_end",
	RUN_DONE: "run_done",
	RUN_ERROR: "run_error",
	RUN_RESUMED: "run_resumed",
	CONVERSATION_SNAPSHOT: "conversation_snapshot",
	CONVERSATION_LIST: "conversation_list",
	SETTINGS_UPDATE: "settings_update",
	PERMISSION_REQUEST: "permission_request",
	PERMISSION_EXPIRED: "permission_expired",
	PERMISSION_RESOLVED: "permission_resolved",
	RULES_STATE: "rules_state",
	ASK_QUESTION: "ask_question",
	QUESTION_EXPIRED: "question_expired",
	QUEUE_STATE: "queue_state",
	USER_MESSAGE_ECHO: "user_message_echo",
	RUN_PROGRESS: "run_progress",
	CONVERSATION_MODE: "conversation_mode",
	NOTICE: "notice",
	CHANGE_SET: "change_set",
	USAGE: "usage",
	BLOCK_PREVIEW: "block_preview",
} as const;

/** The role the chat says hello with. */
export const CHAT_ROLE = "chat";

export const CONNECTION_STATUSES = {
	CONNECTING: "connecting",
	CONNECTED: "connected",
	DISCONNECTED: "disconnected",
	RECONNECTING: "reconnecting",
} as const;

export type ConnectionStatus =
	(typeof CONNECTION_STATUSES)[keyof typeof CONNECTION_STATUSES];

/** The wire's most a "Suggest a change" text may carry. */
export const FEEDBACK_MAX_CHARS = 2000;
