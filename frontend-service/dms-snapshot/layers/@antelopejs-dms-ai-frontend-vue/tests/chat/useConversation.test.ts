import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useConversation } from "../../app/chat/composables/useConversation";
import {
	LOCAL_ERROR_KEYS,
	MESSAGE_ROLES,
	TOOL_STATUS,
} from "../../app/chat/constants/conversation";
import {
	CLIENT_MESSAGE_TYPES,
	SERVER_EVENT_TYPES,
} from "../../app/chat/constants/protocol";
import {
	ACTIVITY_KINDS,
	QUIET_NOTICE_AFTER_MS,
} from "../../app/chat/constants/run-status";
import type { RunProgress } from "../../app/chat/types/conversation";
import type { PendingAttachment } from "../../app/chat/utils/attachments";
import { isAgentQuiet } from "../../app/chat/utils/run-status";
import { toolRowState } from "../../app/chat/utils/tool-state";
import type { ToolCallMessage } from "../../app/chat/types/conversation";

const CONVERSATION_ID = "conv-chat-1";
const FILE_DATA = "PGh0bWw+PC9odG1sPg==";

interface Harness {
	conversation: ReturnType<typeof useConversation>;
	sent: Record<string, unknown>[];
	receive: (event: Record<string, unknown>) => void;
	setConnected: (isConnected: boolean) => void;
}

function harness(): Harness {
	const sent: Record<string, unknown>[] = [];
	let isConnected = true;
	let deliver: (msg: unknown) => void = () => {};
	const conversation = useConversation({
		activeId: ref(CONVERSATION_ID),
		send: (msg) => {
			if (!isConnected) return false;
			sent.push(msg as Record<string, unknown>);
			return true;
		},
		onMessage: (handler) => {
			deliver = handler;
			return () => {};
		},
	});
	return {
		conversation,
		sent,
		receive: (event) => deliver({ conversationId: CONVERSATION_ID, ...event }),
		setConnected: (value) => {
			isConnected = value;
		},
	};
}

function attachment(): PendingAttachment {
	return {
		id: "att-1",
		name: "OP_Manager_v176.html",
		mimeType: "text/html",
		size: 13,
		data: FILE_DATA,
		dataUrl: `data:text/html;base64,${FILE_DATA}`,
	};
}

function startToolCall(h: Harness): void {
	h.receive({
		type: SERVER_EVENT_TYPES.TOOL_CALL_START,
		callId: "call-1",
		toolName: "Bash",
		args: { command: "pnpm dev" },
	});
}

describe("a run that fails reaches the user", () => {
	it("ends the run with the reason, and leaves no tool running", () => {
		const h = harness();
		h.conversation.sendUserMessage("reproduire sans casser le design", [
			attachment(),
		]);
		startToolCall(h);
		h.receive({
			type: SERVER_EVENT_TYPES.RUN_ERROR,
			error: "The agent stopped before finishing its answer.",
		});
		const messages = h.conversation.messages.value;
		expect(h.conversation.isRunning.value).toBe(false);
		expect(messages.at(-1)).toMatchObject({
			role: MESSAGE_ROLES.ERROR,
			content: "The agent stopped before finishing its answer.",
		});
		expect(messages.find((m) => m.role === MESSAGE_ROLES.TOOL)).toMatchObject({
			status: TOOL_STATUS.ERROR,
			outcome: "stopped",
		});
	});

	it("says a message was not sent instead of waiting for an answer", () => {
		const h = harness();
		h.setConnected(false);
		h.conversation.sendUserMessage("reproduire sans casser le design");
		expect(h.conversation.isRunning.value).toBe(false);
		expect(h.conversation.messages.value.at(-1)).toMatchObject({
			role: MESSAGE_ROLES.ERROR,
			contentKey: LOCAL_ERROR_KEYS.NOT_SENT,
		});
	});

	it("asks the sidecar to run a failed turn again", () => {
		const h = harness();
		h.conversation.sendUserMessage("reproduire sans casser le design", [
			attachment(),
		]);
		h.receive({ type: SERVER_EVENT_TYPES.RUN_ERROR, error: "API Error: 529" });
		h.conversation.retry();
		expect(
			h.sent.filter((msg) => msg.type === CLIENT_MESSAGE_TYPES.USER_MESSAGE),
		).toHaveLength(1);
		expect(h.sent.at(-1)).toEqual({
			type: CLIENT_MESSAGE_TYPES.RETRY_TURN,
			conversationId: CONVERSATION_ID,
		});
		expect(h.conversation.isRunning.value).toBe(true);
	});

	it("resends a message that never left, with its file", () => {
		const h = harness();
		h.setConnected(false);
		h.conversation.sendUserMessage("reproduire", [attachment()]);
		h.setConnected(true);
		h.conversation.retry();
		expect(h.sent.at(-1)).toMatchObject({
			type: CLIENT_MESSAGE_TYPES.USER_MESSAGE,
			content: "reproduire",
			attachments: [{ name: "OP_Manager_v176.html", data: FILE_DATA }],
		});
	});

	it("shows an unsent message once, even after a retry", () => {
		const h = harness();
		h.setConnected(false);
		h.conversation.sendUserMessage("reproduire sans casser le design");
		h.setConnected(true);
		h.conversation.retry();
		const bubbles = h.conversation.messages.value.filter(
			(msg) => msg.role === MESSAGE_ROLES.USER,
		);
		expect(bubbles).toHaveLength(1);
		expect(bubbles[0]).not.toHaveProperty("isUnsent");
		expect(h.sent).toHaveLength(1);
	});

	it("offers no retry for a failure the same request cannot get past", () => {
		const h = harness();
		h.conversation.sendUserMessage("go");
		h.receive({
			type: SERVER_EVENT_TYPES.RUN_ERROR,
			error: "The conversation no longer fits in the model's context.",
			isRetryable: false,
		});
		h.receive({
			type: SERVER_EVENT_TYPES.CONVERSATION_SNAPSHOT,
			messages: [
				{ role: "user", content: "go", timestampMs: 1 },
				{
					role: "error",
					content: "The conversation no longer fits in the model's context.",
					isRetryable: false,
					timestampMs: 2,
				},
				{ role: "error", content: "API Error: 529", timestampMs: 3 },
			],
		});
		const [, tooLong, overloaded] = h.conversation.messages.value;
		expect(tooLong).toMatchObject({ isRetryable: false });
		expect(overloaded).toMatchObject({ isRetryable: true });
	});

	it("asks for the files again when an unsent message lost them", () => {
		const h = harness();
		h.setConnected(false);
		h.conversation.sendUserMessage("reproduire", [attachment()]);
		const unsent = h.conversation.messages.value[0];
		if (unsent.role !== MESSAGE_ROLES.USER) throw new Error("no user message");
		unsent.attachments = [{ name: "a.html", mimeType: "text/html", size: 1 }];
		h.setConnected(true);
		h.conversation.retry();
		expect(h.sent).toEqual([]);
		expect(h.conversation.messages.value.at(-1)).toMatchObject({
			contentKey: LOCAL_ERROR_KEYS.RETRY_NEEDS_FILES,
		});
	});

	it("shows a stored error, and a tool left open as stopped after a reload", () => {
		const h = harness();
		h.receive({
			type: SERVER_EVENT_TYPES.CONVERSATION_SNAPSHOT,
			messages: [
				{ role: "user", content: "go", timestampMs: 1 },
				{
					role: "tool_use",
					content: "{}",
					toolName: "Bash",
					callId: "call-1",
					timestampMs: 2,
				},
				{ role: "error", content: "The run was stopped.", timestampMs: 3 },
			],
		});
		const [, tool, error] = h.conversation.messages.value;
		expect(toolRowState(tool as ToolCallMessage, false, null)).toBe("stopped");
		expect(error).toMatchObject({
			role: MESSAGE_ROLES.ERROR,
			content: "The run was stopped.",
		});
	});

	it("lets the run go when Stop cannot reach the assistant", () => {
		const h = harness();
		h.conversation.sendUserMessage("go");
		h.setConnected(false);
		h.conversation.interrupt();
		expect(h.conversation.isRunning.value).toBe(false);
		expect(h.conversation.messages.value.at(-1)).toMatchObject({
			contentKey: LOCAL_ERROR_KEYS.STOP_NOT_DELIVERED,
		});
	});
});

describe("a run that keeps working shows it", () => {
	it("keeps what the agent reports, and when it last heard from the sidecar", () => {
		const h = harness();
		h.conversation.sendUserMessage("go");
		const before = h.conversation.lastEventAtMs.value;
		h.receive({
			type: SERVER_EVENT_TYPES.RUN_PROGRESS,
			activity: "writing",
			detail: "Write",
			elapsedMs: 42_000,
			idleMs: 1_000,
		});
		expect(h.conversation.isTurnInFlight.value).toBe(true);
		expect(h.conversation.progress.value).toMatchObject({
			activity: "writing",
			detail: "Write",
			elapsedMs: 42_000,
		});
		expect(h.conversation.lastEventAtMs.value).toBeGreaterThanOrEqual(before);
	});

	it("forgets the progress once the run is over", () => {
		const h = harness();
		h.conversation.sendUserMessage("go");
		h.receive({
			type: SERVER_EVENT_TYPES.RUN_PROGRESS,
			activity: "thinking",
			elapsedMs: 0,
			idleMs: 0,
		});
		h.receive({ type: SERVER_EVENT_TYPES.RUN_DONE });
		expect(h.conversation.progress.value).toBeNull();
		expect(h.conversation.isTurnInFlight.value).toBe(false);
		expect(h.conversation.isRunning.value).toBe(false);
	});
});

describe("a quiet agent is only called out when silence is unexpected", () => {
	const quietFor = (activity: RunProgress["activity"]): RunProgress => ({
		activity,
		elapsedMs: QUIET_NOTICE_AFTER_MS,
		idleMs: QUIET_NOTICE_AFTER_MS,
		receivedAtMs: 0,
	});

	it("says so while the model is thinking", () => {
		expect(isAgentQuiet(quietFor(ACTIVITY_KINDS.THINKING), 0)).toBe(true);
	});

	it("stays silent while a tool runs without output", () => {
		expect(isAgentQuiet(quietFor(ACTIVITY_KINDS.TOOL), 0)).toBe(false);
	});
});
