import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useConversation } from "../../app/chat/composables/useConversation";
import { usePermissionQueue } from "../../app/chat/composables/usePermissionQueue";
import { useQuestionQueue } from "../../app/chat/composables/useQuestionQueue";
import { useQueueActions } from "../../app/chat/composables/useQueueActions";
import type { ChangeSetSummary } from "../../app/chat/types/protocol";

const CONVERSATION_ID = "conv-1";

interface Bus {
	sent: Record<string, unknown>[];
	receive: (event: Record<string, unknown>) => void;
	options: {
		activeId: ReturnType<typeof ref<string>>;
		send: (msg: object) => boolean;
		onMessage: (handler: (msg: unknown) => void) => () => void;
	};
}

function bus(): Bus {
	const sent: Record<string, unknown>[] = [];
	const handlers: ((msg: unknown) => void)[] = [];
	return {
		sent,
		receive: (event) =>
			handlers.forEach((handler) =>
				handler({ conversationId: CONVERSATION_ID, ...event }),
			),
		options: {
			activeId: ref(CONVERSATION_ID),
			send: (msg) => {
				sent.push(msg as Record<string, unknown>);
				return true;
			},
			onMessage: (handler) => {
				handlers.push(handler);
				return () => undefined;
			},
		},
	};
}

function changeSet(
	overrides: Partial<ChangeSetSummary> = {},
): ChangeSetSummary {
	return {
		id: "cs-14",
		number: 14,
		conversationId: CONVERSATION_ID,
		title: "Top customers",
		createdAtMs: 1,
		agent: "claude",
		scope: "safe",
		isAutoFix: false,
		overlapped: false,
		files: [
			{
				path: "sales/overview.page.ts",
				status: "modified",
				added: 14,
				removed: 1,
			},
		],
		added: 14,
		removed: 1,
		typecheck: "passed",
		state: "applied",
		approvalsNeeded: 0,
		builderOps: 2,
		...overrides,
	};
}

describe("the conversation folds the redesign's events", () => {
	it("closes a call with its outcome, how it was allowed and its change set", () => {
		const b = bus();
		const conversation = useConversation(b.options as never);
		b.receive({
			type: "tool_call_start",
			callId: "c1",
			toolName: "Edit",
			args: {},
		});
		b.receive({
			type: "tool_call_end",
			callId: "c1",
			status: "error",
			result: "denied",
			outcome: "denied",
			allowedBy: "denied",
		});
		expect(conversation.messages.value[0]).toMatchObject({
			outcome: "denied",
			allowedBy: "denied",
			status: "error",
		});
		expect(conversation.messages.value[0]).toHaveProperty("endedAtMs");
	});

	it("draws a change set card once and updates it when undone", () => {
		const b = bus();
		const conversation = useConversation(b.options as never);
		b.receive({ type: "change_set", changeSet: changeSet() });
		b.receive({
			type: "change_set",
			changeSet: changeSet({ state: "undone", stateChangedBy: "Camille" }),
		});
		const cards = conversation.messages.value.filter(
			(m) => m.role === "change_set",
		);
		expect(cards).toHaveLength(1);
		expect(conversation.changeSets.value["cs-14"]).toMatchObject({
			state: "undone",
			stateChangedBy: "Camille",
		});
	});

	it("keeps notices, the token count and the chat's mode", () => {
		const b = bus();
		const conversation = useConversation(b.options as never);
		b.receive({
			type: "notice",
			notice: {
				kind: "autofix",
				attempt: 1,
				maxAttempts: 2,
				errors: ["TS2339"],
				timestampMs: 5,
			},
		});
		b.receive({ type: "usage", totalTokens: 9_600 });
		b.receive({
			type: "conversation_mode",
			mode: "plan",
			generationMode: "vibe",
			fullAuto: { duration: "turn" },
		});
		expect(conversation.messages.value[0]).toMatchObject({
			role: "notice",
			notice: { kind: "autofix", attempt: 1 },
		});
		expect(conversation.totalTokens.value).toBe(9_600);
		expect(conversation.mode.value).toEqual({
			mode: "plan",
			generationMode: "vibe",
			fullAuto: { duration: "turn" },
		});
	});

	it("rebuilds the transcript from a snapshot with its new roles", () => {
		const b = bus();
		const conversation = useConversation(b.options as never);
		b.receive({
			type: "conversation_snapshot",
			messages: [
				{ role: "user", content: "go", timestampMs: 1 },
				{
					role: "tool_use",
					content: '{"command":"pnpm test"}',
					toolName: "Bash",
					callId: "c1",
					allowedBy: "rule",
					timestampMs: 2,
				},
				{
					role: "tool_result",
					content: "ok",
					callId: "c1",
					status: "success",
					outcome: "done",
					changeSetId: "cs-14",
					timestampMs: 5,
				},
				{
					role: "notice",
					content: "",
					notice: { kind: "question_skipped", header: "Sort", timestampMs: 6 },
					timestampMs: 6,
				},
				{
					role: "question_answer",
					content: "",
					answers: [
						{
							header: "Where",
							question: "Where?",
							answer: "Finance",
							skipped: false,
							isCustom: false,
						},
					],
					timestampMs: 7,
				},
				{
					role: "change_set",
					content: "",
					changeSetId: "cs-14",
					timestampMs: 8,
				},
			],
			changeSets: [changeSet()],
			mode: { mode: "acceptEdits", generationMode: "safe", fullAuto: null },
			totalTokens: 1_200,
		});
		expect(conversation.messages.value.map((m) => m.role)).toEqual([
			"user",
			"tool",
			"notice",
			"question_answer",
			"change_set",
		]);
		expect(conversation.messages.value[1]).toMatchObject({
			outcome: "done",
			allowedBy: "rule",
			endedAtMs: 5,
		});
		expect(conversation.changeSets.value["cs-14"]?.number).toBe(14);
		expect(conversation.mode.value?.mode).toBe("acceptEdits");
		expect(conversation.totalTokens.value).toBe(1_200);
	});

	it("ignores another conversation's events", () => {
		const b = bus();
		const conversation = useConversation(b.options as never);
		b.receive({ type: "usage", totalTokens: 5, conversationId: "other" });
		expect(conversation.totalTokens.value).toBeNull();
	});
});

describe("a running turn reads the same live, after a re-attach and after a reload", () => {
	const TURN = [
		{
			type: "assistant_message_chunk",
			text: "I'll check two things in parallel.",
		},
		{ type: "tool_call_start", callId: "t1", toolName: "Read", args: {} },
		{
			type: "tool_call_end",
			callId: "t1",
			status: "success",
			result: "",
			outcome: "done",
		},
		{ type: "assistant_message_chunk", text: "The page has two blocks." },
		{ type: "tool_call_start", callId: "t2", toolName: "Read", args: {} },
		{
			type: "tool_call_end",
			callId: "t2",
			status: "success",
			result: "",
			outcome: "done",
		},
		{ type: "assistant_message_chunk", text: "All done." },
	];
	const shape = (conversation: ReturnType<typeof useConversation>) =>
		conversation.messages.value.map((m) =>
			m.role === "assistant"
				? `text:${m.content}`
				: m.role === "tool"
					? `tool:${m.callId}`
					: m.role,
		);
	const EXPECTED = [
		"user",
		"text:I'll check two things in parallel.",
		"tool:t1",
		"text:The page has two blocks.",
		"tool:t2",
		"text:All done.",
	];

	it("keeps chunk → tool → chunk → tool → chunk interleaved through run_done", () => {
		const b = bus();
		const conversation = useConversation(b.options as never);
		conversation.sendUserMessage("go");
		TURN.forEach(b.receive);
		b.receive({ type: "run_done" });
		expect(shape(conversation)).toEqual(EXPECTED);
	});

	it("does not append the replayed turn to its stored part on re-attach", () => {
		const b = bus();
		const conversation = useConversation(b.options as never);
		b.receive({
			type: "conversation_snapshot",
			messages: [
				{ role: "assistant", content: "Earlier answer.", timestampMs: 1 },
				{ role: "user", content: "go", timestampMs: 1_000 },
				{
					role: "assistant",
					content: "I'll check two things in parallel.",
					timestampMs: 1_100,
				},
				{
					role: "tool_use",
					content: "{}",
					toolName: "Read",
					callId: "t1",
					timestampMs: 1_200,
				},
				{
					role: "tool_result",
					content: "",
					callId: "t1",
					status: "success",
					outcome: "done",
					timestampMs: 1_500,
				},
				{
					role: "assistant",
					content: "The page has two blocks.",
					timestampMs: 1_600,
				},
				{
					role: "tool_use",
					content: "{}",
					toolName: "Read",
					callId: "t2",
					timestampMs: 1_700,
				},
			],
		});
		b.receive({ type: "run_resumed" });
		TURN.forEach(b.receive);
		b.receive({ type: "run_done" });
		expect(shape(conversation)).toEqual(["text:Earlier answer.", ...EXPECTED]);
	});

	it("keeps each call's own start and end through a replay", () => {
		const b = bus();
		const conversation = useConversation(b.options as never);
		b.receive({
			type: "conversation_snapshot",
			messages: [
				{ role: "user", content: "go", timestampMs: 1_000 },
				{
					role: "tool_use",
					content: "{}",
					toolName: "Read",
					callId: "t1",
					timestampMs: 1_200,
				},
				{
					role: "tool_result",
					content: "",
					callId: "t1",
					status: "success",
					outcome: "done",
					timestampMs: 1_300,
				},
			],
		});
		b.receive({ type: "run_resumed" });
		TURN.slice(1, 3).forEach(b.receive);
		const tool = conversation.messages.value.find((m) => m.role === "tool");
		expect(tool).toMatchObject({ timestampMs: 1_200, endedAtMs: 1_300 });
	});
});

describe("approvals answer with the new vocabulary", () => {
	const request = {
		type: "permission_request",
		requestId: "r1",
		callId: "c1",
		toolName: "Edit",
		args: { file_path: "a.ts" },
		summary: "Edit a.ts",
		kind: "edit",
		alwaysAsk: false,
		preview: {
			type: "diff",
			path: "/a.ts",
			relativePath: "a.ts",
			isNewFile: false,
			added: 1,
			removed: 0,
			hunks: [],
		},
		ruleOptions: [{ kind: "file", value: "a.ts" }],
		createdAtMs: 1,
		expiresAtMs: 300_001,
	};

	it("allows with a rule, and denies with the user's suggestion", () => {
		const b = bus();
		const queue = usePermissionQueue(b.options as never);
		b.receive(request);
		b.receive({ ...request, requestId: "r2" });
		queue.respond("r1", {
			decision: "allow_rule",
			rule: { kind: "file", value: "a.ts" },
		});
		queue.respond("r2", {
			decision: "deny",
			feedback: "  Use the Builder instead  ",
		});
		expect(b.sent).toEqual([
			{
				type: "permission_response",
				conversationId: CONVERSATION_ID,
				requestId: "r1",
				decision: "allow_rule",
				rule: { kind: "file", value: "a.ts" },
			},
			{
				type: "permission_response",
				conversationId: CONVERSATION_ID,
				requestId: "r2",
				decision: "deny",
				feedback: "Use the Builder instead",
			},
		]);
		expect(queue.queue.value).toEqual([]);
	});

	it("never offers rules for always-ask", () => {
		const b = bus();
		const queue = usePermissionQueue(b.options as never);
		b.receive({ ...request, alwaysAsk: true });
		expect(queue.queue.value[0].ruleOptions).toEqual([]);
	});

	it("drops a request another tab answered, and keeps an expired one as a card", () => {
		const b = bus();
		const queue = usePermissionQueue(b.options as never);
		b.receive(request);
		b.receive({ ...request, requestId: "r2" });
		b.receive({
			type: "permission_resolved",
			requestId: "r1",
			decision: "allow_once",
		});
		b.receive({
			type: "permission_expired",
			requestId: "r2",
			toolName: "Edit",
			summary: "Edit a.ts",
			expiredAtMs: 9,
		});
		expect(queue.queue.value).toEqual([]);
		expect(queue.expired.value).toEqual([
			{
				requestId: "r2",
				conversationId: CONVERSATION_ID,
				toolName: "Edit",
				summary: "Edit a.ts",
				expiredAtMs: 9,
			},
		]);
	});

	it("denies everything at once, lists rules and revokes them", () => {
		const b = bus();
		const queue = usePermissionQueue(b.options as never);
		b.receive(request);
		b.receive({
			type: "rules_state",
			rules: [
				{
					id: "rule-1",
					kind: "command",
					value: "pnpm test",
					label: "Commands starting pnpm test",
					createdAtMs: 1,
				},
			],
		});
		queue.denyAll();
		queue.revokeRule("rule-1");
		expect(b.sent).toEqual([
			{
				type: "permission_response",
				conversationId: CONVERSATION_ID,
				requestId: "r1",
				decision: "deny_all",
			},
			{
				type: "revoke_rule",
				conversationId: CONVERSATION_ID,
				ruleId: "rule-1",
			},
		]);
		expect(queue.rules.value).toEqual([]);
	});
});

describe("questions can be skipped and leave a record", () => {
	it("sends answers with the skipped flags and returns the transcript record", () => {
		const b = bus();
		const questions = useQuestionQueue(b.options as never);
		b.receive({
			type: "ask_question",
			requestId: "q1",
			questions: [
				{
					question: "Where?",
					header: "Placement",
					options: [
						{ label: "Finance", description: "" },
						{ label: "Tab", description: "" },
					],
				},
				{
					question: "Sort?",
					header: "Sort",
					options: [
						{ label: "Days", description: "" },
						{ label: "Amount", description: "" },
					],
				},
				{
					question: "Action?",
					header: "Action",
					options: [
						{ label: "Send", description: "" },
						{ label: "Log", description: "" },
					],
				},
			],
		});
		const records = questions.respond("q1", [
			{ answer: "Finance", isCustom: false, skipped: false },
			{ answer: "", isCustom: false, skipped: true },
			{ answer: "Send and log it", isCustom: true, skipped: false },
		]);
		expect(b.sent[0]).toEqual({
			type: "question_response",
			conversationId: CONVERSATION_ID,
			requestId: "q1",
			answers: ["Finance", "", "Send and log it"],
			skipped: [false, true, false],
		});
		expect(
			records?.map((record) => [
				record.answer,
				record.skipped,
				record.isCustom,
			]),
		).toEqual([
			["Finance", false, false],
			[null, true, false],
			["Send and log it", false, true],
		]);
	});

	it("drops a question the sidecar timed out", () => {
		const b = bus();
		const questions = useQuestionQueue(b.options as never);
		b.receive({ type: "ask_question", requestId: "q1", questions: [] });
		b.receive({ type: "question_expired", requestId: "q1" });
		expect(questions.queue.value).toEqual([]);
	});
});

describe("the follow-up queue is edited from the chat", () => {
	it("updates, reorders, cancels and clears, showing each change at once", () => {
		const b = bus();
		const queued = ref([
			{ id: "a", content: "first", attachments: [] },
			{ id: "b", content: "second", attachments: [] },
		]);
		const actions = useQueueActions({
			activeId: b.options.activeId as never,
			queued,
			send: b.options.send,
		});
		actions.update("a", "first, edited");
		actions.move("b", 0);
		expect(queued.value.map((item) => item.content)).toEqual([
			"second",
			"first, edited",
		]);
		actions.cancel("a");
		actions.clear();
		expect(queued.value).toEqual([]);
		expect(b.sent.map((msg) => msg.type)).toEqual([
			"queue_update",
			"queue_move",
			"queue_cancel",
			"queue_clear",
		]);
		expect(b.sent[1]).toEqual({
			type: "queue_move",
			conversationId: CONVERSATION_ID,
			id: "b",
			toIndex: 0,
		});
	});
});
