// @vitest-environment jsdom
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import {
	buttonWithText,
	CONVERSATION_ID,
	createHarness,
	deliver,
	openPanel,
	sendMessage,
	sentOfType,
	unmountPanel,
} from "./support/panel-harness";

const DIFF_REQUEST = {
	type: "permission_request",
	requestId: "r1",
	callId: "c1",
	toolName: "Edit",
	args: { file_path: "/repo/crm/customers/customer.form.ts" },
	summary: "Edit customer.form.ts",
	kind: "edit",
	alwaysAsk: false,
	preview: {
		type: "diff",
		path: "/repo/crm/customers/customer.form.ts",
		relativePath: "crm/customers/customer.form.ts",
		isNewFile: false,
		added: 1,
		removed: 1,
		hunks: [
			{
				oldStart: 42,
				newStart: 42,
				lines: [
					{ kind: "remove", text: 'label: "VAT",' },
					{ kind: "add", text: 'label: "VAT number",' },
				],
			},
		],
	},
	ruleOptions: [
		{ kind: "file", value: "crm/customers/customer.form.ts" },
		{ kind: "directory", value: "crm/customers/" },
	],
	createdAtMs: Date.now(),
	expiresAtMs: Date.now() + 252_000,
};

const COMMAND_REQUEST = {
	...DIFF_REQUEST,
	requestId: "r2",
	callId: "c2",
	toolName: "Bash",
	args: { command: "pnpm add jsvat" },
	summary: "Run pnpm add jsvat",
	kind: "command",
	preview: {
		type: "command",
		command: "pnpm add jsvat",
		cwd: "/repo",
		effect: "adds_dependency",
		touches: ["package.json", "pnpm-lock.yaml"],
	},
	ruleOptions: [{ kind: "command", value: "pnpm add" }],
};

const DELETE_REQUEST = {
	...DIFF_REQUEST,
	requestId: "r3",
	callId: "c3",
	toolName: "mcp__dms-ai__BuilderDeleteResource",
	args: { ref: "legacy_coupons" },
	summary: "Delete the table legacy_coupons",
	kind: "destructive",
	alwaysAsk: true,
	preview: {
		type: "destructive",
		operation: "resource · API routes",
		target: "legacy_coupons",
		consequence: "deletes_data",
		confirmText: "legacy_coupons",
		canKeepData: true,
	},
	ruleOptions: [],
};

const CHANGE_SET = {
	id: "cs-14",
	number: 14,
	conversationId: CONVERSATION_ID,
	title: "Top customers",
	createdAtMs: Date.now(),
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
		{
			path: "sales/queries/top-customers.ts",
			status: "added",
			added: 22,
			removed: 0,
		},
	],
	added: 36,
	removed: 1,
	typecheck: "passed",
	state: "applied",
	approvalsNeeded: 0,
	builderOps: 2,
};

function keydown(target: Element, key: string): void {
	target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

beforeEach(() => {
	localStorage.setItem("dms-ai-conversation-id", CONVERSATION_ID);
});

afterEach(() => {
	unmountPanel();
	localStorage.clear();
	vi.useRealTimers();
});

describe("the panel's header and empty chat", () => {
	it("invites a first request about the page on screen", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		expect(panel.find(".cb-empty h3").text()).toBe(
			"What should we change on Sales overview?",
		);
		await buttonWithText(panel.find(".cb-suggest"), "Add a chart").trigger(
			"click",
		);
		expect((panel.find("textarea").element as HTMLTextAreaElement).value).toBe(
			"Add a chart to Sales overview",
		);
		expect(panel.find(".att.is-page").text()).toContain("sales/overview");
		expect(panel.find(".cb__status").text()).toBe("Ready · Claude Code");
	});

	it("says it works with the turn's clock, then waits for the user", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "go");
		deliver(harness, {
			type: "run_progress",
			activity: "tool",
			elapsedMs: 14_000,
			idleMs: 0,
		});
		await nextTick();
		expect(panel.find(".cb__status").text()).toContain("Working · 0:14");
		deliver(harness, DIFF_REQUEST);
		await nextTick();
		expect(panel.find(".cb__status").text()).toContain(
			"Waiting for you · 1 request",
		);
	});

	it("sends leave_conversation when the panel closes", async () => {
		const harness = createHarness();
		await openPanel(harness);
		harness.session.panel.close();
		await nextTick();
		expect(sentOfType(harness, "leave_conversation")).toEqual([
			{ type: "leave_conversation", conversationId: CONVERSATION_ID },
		]);
	});

	it("stamps a message with the page unless its chip was removed", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await panel
			.find('button[aria-label="Remove page context"]')
			.trigger("click");
		await sendMessage(panel, "explain");
		expect(sentOfType(harness, "user_message")[0]).toMatchObject({
			content: "explain",
			includePageContext: false,
		});
		expect(panel.find(".cb-user__meta").text()).toContain("sales/overview");
	});
});

describe("tool rows and change sets", () => {
	it("draws each call with the lexicon's words and its state", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "go");
		deliver(harness, {
			type: "tool_call_start",
			callId: "c0",
			toolName: "Read",
			args: { file_path: "/a/customer.form.ts" },
		});
		deliver(harness, {
			type: "tool_call_end",
			callId: "c0",
			status: "success",
			result: "",
			outcome: "done",
		});
		deliver(harness, {
			type: "tool_call_start",
			callId: "c9",
			toolName: "Bash",
			args: { command: "pnpm add dayjs" },
		});
		deliver(harness, {
			type: "tool_call_end",
			callId: "c9",
			status: "error",
			result: "",
			outcome: "denied",
		});
		deliver(harness, {
			type: "tool_call_start",
			callId: "c1",
			toolName: "Edit",
			args: { file_path: "/repo/crm/customers/customer.form.ts" },
		});
		deliver(harness, DIFF_REQUEST);
		await nextTick();
		const rows = panel.findAll(".cb-tool");
		expect(
			rows.map((row) => row.classes().find((name) => name.startsWith("is-"))),
		).toEqual(["is-done", "is-denied", "is-waiting"]);
		expect(rows[0].text()).toContain("Read file");
		expect(rows[0].text()).toContain("customer.form.ts");
		expect(rows[2].text()).toContain("1 of 1 · below");
		expect(panel.find(".cb-tools__head").text()).toContain("Used 3 tools");
	});

	it("shows the raw JSON of a call on demand", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "go");
		deliver(harness, {
			type: "tool_call_start",
			callId: "c0",
			toolName: "mcp__dms-ai__BuilderAddBlock",
			args: { name: "Top customers", type: "TopListCard" },
		});
		deliver(harness, {
			type: "tool_call_end",
			callId: "c0",
			status: "success",
			result: "ok",
			outcome: "done",
		});
		await nextTick();
		await panel.find(".cb-tool").trigger("click");
		expect(panel.find(".cb-kv").text()).toContain("TopListCard");
		await buttonWithText(panel, "Raw JSON").trigger("click");
		expect(panel.find(".cb-raw").text()).toContain('"type": "TopListCard"');
	});

	it("ends a turn with its change set: undo, review, then redo", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "go");
		deliver(harness, { type: "change_set", changeSet: CHANGE_SET });
		deliver(harness, { type: "run_done" });
		await nextTick();
		const card = panel.find(".cb-change");
		expect(card.text()).toContain("Applied · checkpoint 14");
		expect(card.text()).toContain("2 files changed · 2 Builder operations");
		expect(card.text()).toContain("new");
		await buttonWithText(card, "Review diff").trigger("click");
		expect(harness.navigate).toHaveBeenCalledWith(
			"/modules/ai/changes?set=cs-14",
		);
		await buttonWithText(card, "Undo").trigger("click");
		await flushPromises();
		expect(sentOfType(harness, "change_set_action")).toEqual([
			{
				type: "change_set_action",
				conversationId: CONVERSATION_ID,
				changeSetId: "cs-14",
				action: "undo",
			},
		]);
		deliver(harness, {
			type: "change_set",
			changeSet: { ...CHANGE_SET, state: "undone", stateChangedBy: "Camille" },
		});
		await nextTick();
		expect(panel.find(".cb-change").text()).toContain(
			"Undone · checkpoint 14 restored",
		);
		expect(panel.find(".cb-change").text()).toContain("by Camille");
		await buttonWithText(panel.find(".cb-change"), "Redo").trigger("click");
		expect(sentOfType(harness, "change_set_action").at(-1)).toMatchObject({
			action: "redo",
		});
	});

	it("asks before undoing a set later ones build on", async () => {
		const harness = createHarness();
		vi.mocked(harness.api.get).mockResolvedValueOnce({
			conflicts: [
				{
					changeSetId: "cs-15",
					number: 15,
					title: "Refund rate",
					files: ["sales/overview.page.ts"],
				},
			],
		});
		const panel = await openPanel(harness);
		deliver(harness, { type: "change_set", changeSet: CHANGE_SET });
		await nextTick();
		await buttonWithText(panel.find(".cb-change"), "Undo").trigger("click");
		await flushPromises();
		expect(panel.find(".u-modal").text()).toContain("#15 Refund rate");
		await buttonWithText(panel.find(".u-modal"), "Undo them together").trigger(
			"click",
		);
		expect(sentOfType(harness, "change_set_action")[0]).toMatchObject({
			includeLater: true,
		});
	});
});

describe("the approvals dock", () => {
	it("previews a diff with line numbers and allows a scope with ↵", async () => {
		// The countdown reads the clock: frozen at the request's creation, it
		// shows the full grace period however slow the run is.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(DIFF_REQUEST.createdAtMs);
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, DIFF_REQUEST);
		deliver(harness, COMMAND_REQUEST);
		await nextTick();
		const dock = panel.find(".cb-approve");
		expect(dock.attributes("role")).toBe("alertdialog");
		expect(dock.text()).toContain("Needs your approval · 1 of 2");
		expect(dock.text()).toContain("denies in 4:12");
		expect(panel.find(".perm.is-focused .perm__title").text()).toBe(
			"Edit customer.form.ts",
		);
		expect(panel.findAll(".ln").map((row) => row.text())).toEqual([
			"@@ −42 +42 @@",
			'42−label: "VAT",',
			'42+label: "VAT number",',
		]);
		expect(dock.text()).toContain("Every edit under crm/customers/");
		await panel.findAll(".perm.is-focused .scope-opt input")[2].setValue(true);
		keydown(dock.element, "Enter");
		await nextTick();
		expect(sentOfType(harness, "permission_response")[0]).toEqual({
			type: "permission_response",
			conversationId: CONVERSATION_ID,
			requestId: "r1",
			decision: "allow_rule",
			rule: { kind: "directory", value: "crm/customers/" },
		});
		expect(panel.find(".perm.is-focused .perm__title").text()).toBe(
			"Run pnpm add jsvat",
		);
		expect(panel.find(".perm.is-focused").text()).toContain(
			"adds a dependency · package.json, pnpm-lock.yaml",
		);
	});

	it("moves with J and K, denies with N, and denies everything at once", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, DIFF_REQUEST);
		deliver(harness, COMMAND_REQUEST);
		await nextTick();
		const dock = panel.find(".cb-approve");
		keydown(dock.element, "j");
		await nextTick();
		expect(dock.text()).toContain("2 of 2");
		keydown(dock.element, "k");
		await nextTick();
		expect(dock.text()).toContain("1 of 2");
		keydown(dock.element, "n");
		await nextTick();
		expect(sentOfType(harness, "permission_response")[0]).toMatchObject({
			requestId: "r1",
			decision: "deny",
		});
		deliver(harness, DIFF_REQUEST);
		await nextTick();
		await buttonWithText(
			panel.find(".cb-approve"),
			"Deny both and stop",
		).trigger("click");
		expect(sentOfType(harness, "permission_response").at(-1)).toMatchObject({
			decision: "deny_all",
		});
	});

	it("denies with the user's suggestion", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, DIFF_REQUEST);
		await nextTick();
		await buttonWithText(panel, "Suggest a change").trigger("click");
		await panel
			.find(".u-textarea")
			.setValue("Use the Builder's validation instead");
		await buttonWithText(panel, "Deny and send").trigger("click");
		expect(sentOfType(harness, "permission_response")[0]).toMatchObject({
			decision: "deny",
			feedback: "Use the Builder's validation instead",
		});
	});

	it("makes a data loss typed, offers to keep the data, and never a chat-wide rule", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, DELETE_REQUEST);
		await nextTick();
		const card = panel.find(".perm.is-danger");
		expect(card.text()).toContain("Data loss");
		expect(card.text()).not.toContain("this chat");
		const confirm = buttonWithText(card, "Delete");
		expect(confirm.attributes("disabled")).toBeDefined();
		await card.find(".perm__confirm input").setValue("legacy_coupons");
		expect(
			buttonWithText(card, "Delete").attributes("disabled"),
		).toBeUndefined();
		await card.find('input[type="checkbox"]').setValue(true);
		await buttonWithText(card, "Remove the code only").trigger("click");
		expect(sentOfType(harness, "permission_response")[0]).toMatchObject({
			decision: "allow_once",
			keepData: true,
		});
	});

	it("turns an expired request into a card that asks again", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, DIFF_REQUEST);
		deliver(harness, {
			type: "permission_expired",
			requestId: "r1",
			toolName: "Edit",
			summary: "Edit customer.form.ts",
			expiredAtMs: Date.now(),
		});
		await nextTick();
		expect(panel.find(".cb-approve").exists()).toBe(false);
		const card = panel.find(".cb-expired");
		expect(card.text()).toContain("Edit file request expired");
		await buttonWithText(card, "Ask again").trigger("click");
		expect(sentOfType(harness, "user_message")[0].content).toContain(
			"Edit customer.form.ts",
		);
		expect(panel.find(".cb-expired").exists()).toBe(false);
	});

	it("lists the rules allowed in this chat and revokes one", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, DIFF_REQUEST);
		deliver(harness, {
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
		await nextTick();
		const rules = panel.find(".cb-approve .cb-rules");
		expect(rules.text()).toContain("Commands starting pnpm test");
		await buttonWithText(rules, "Revoke").trigger("click");
		expect(sentOfType(harness, "revoke_rule")).toEqual([
			{
				type: "revoke_rule",
				conversationId: CONVERSATION_ID,
				ruleId: "rule-1",
			},
		]);
	});
});

describe("questions, queue and modes", () => {
	const QUESTIONS = {
		type: "ask_question",
		requestId: "q1",
		questions: [
			{
				question: "Where should the page live?",
				header: "Placement",
				options: [
					{
						label: "Finance › Overdue invoices",
						description: "Next to Invoices",
					},
					{ label: "A tab on Invoices", description: "" },
				],
			},
			{
				question: "Default sort?",
				header: "Sort",
				options: [
					{ label: "Days overdue", description: "" },
					{ label: "Amount", description: "" },
				],
			},
		],
	};

	it("pages through questions with numbers, Other… and Skip, then keeps the answers", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, QUESTIONS);
		await nextTick();
		const dock = panel.find(".cb-ask");
		expect(dock.text()).toContain("Question 1 of 2 · Placement");
		expect(dock.find(".opt-card.is-selected").text()).toContain("Suggested");
		keydown(dock.element, "3");
		await nextTick();
		await dock.find(".cb-ask__custom").setValue("Under Finance, as a tab");
		await buttonWithText(dock.find(".cb-ask__foot"), "Next").trigger("click");
		expect(dock.text()).toContain("Question 2 of 2 · Sort");
		await buttonWithText(dock, "Skip, you decide").trigger("click");
		expect(sentOfType(harness, "question_response")[0]).toEqual({
			type: "question_response",
			conversationId: CONVERSATION_ID,
			requestId: "q1",
			answers: ["Under Finance, as a tab", ""],
			skipped: [false, true],
		});
		await nextTick();
		const record = panel.find(".cb-answers");
		expect(record.text()).toContain("“Under Finance, as a tab”");
		expect(record.text()).toContain("Skipped: the assistant decides");
	});

	it("edits, reorders and clears the queue", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, {
			type: "queue_state",
			items: [
				{ id: "a", content: "Sort by order count" },
				{ id: "b", content: "Limit to 3 orders" },
			],
		});
		await nextTick();
		await panel
			.find('button[aria-label="Edit queued message"]')
			.trigger("click");
		await panel.find(".cb-queued__editor").setValue("Sort by revenue");
		await buttonWithText(panel.find(".cb-queue"), "Save").trigger("click");
		keydown(panel.findAll(".cb-queued__handle")[1].element, "ArrowUp");
		await nextTick();
		expect(panel.findAll(".cb-queued__txt").map((item) => item.text())).toEqual(
			["Limit to 3 orders", "Sort by revenue"],
		);
		await buttonWithText(panel.find(".cb-queue"), "Clear").trigger("click");
		expect(
			harness.sent
				.map((msg) => msg.type)
				.filter((type) => String(type).startsWith("queue_")),
		).toEqual(["queue_update", "queue_move", "queue_clear"]);
	});

	it("switches the chat's mode and scope, and confirms Full auto with a duration", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await buttonWithText(panel, "Plan only").trigger("click");
		await buttonWithText(panel, "Full auto…").trigger("click");
		await nextTick();
		const modal = panel.find(".u-modal");
		expect(modal.text()).toContain("Turn on Full auto?");
		await buttonWithText(modal, "30 minutes").trigger("click");
		await buttonWithText(modal, "Turn on Full auto").trigger("click");
		expect(sentOfType(harness, "set_conversation_mode")).toEqual([
			{
				type: "set_conversation_mode",
				conversationId: CONVERSATION_ID,
				mode: "plan",
			},
			{
				type: "set_conversation_mode",
				conversationId: CONVERSATION_ID,
				fullAuto: { duration: "30m" },
			},
		]);
		await nextTick();
		const banner = panel.find(".cb-banner-auto");
		expect(banner.text()).toContain("Full auto · for 30 minutes");
		await buttonWithText(banner, "Turn off").trigger("click");
		expect(sentOfType(harness, "set_conversation_mode").at(-1)).toMatchObject({
			fullAuto: null,
		});
	});

	it("runs a proposed plan in Ask first", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "plan a customer health page");
		deliver(harness, {
			type: "tool_call_start",
			callId: "p1",
			toolName: "ExitPlanMode",
			args: { plan: "1. Create the page\n2. Add a query" },
		});
		deliver(harness, {
			type: "tool_call_end",
			callId: "p1",
			status: "success",
			result: "",
			outcome: "done",
		});
		deliver(harness, { type: "run_done" });
		await nextTick();
		const plan = panel.find(".cb-plan");
		expect(plan.text()).toContain("Proposed plan · 2 steps");
		await buttonWithText(plan, "Run with Ask first").trigger("click");
		expect(sentOfType(harness, "set_conversation_mode")[0]).toMatchObject({
			mode: "normal",
		});
		expect(sentOfType(harness, "user_message").at(-1)).toMatchObject({
			content: "Go ahead with the plan.",
		});
	});
});

describe("notices and errors", () => {
	it("shows an auto-fix turn that can be stopped", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "go");
		deliver(harness, {
			type: "notice",
			notice: {
				kind: "autofix",
				attempt: 1,
				maxAttempts: 2,
				errors: ["TS2339 in top-customers.ts"],
				timestampMs: Date.now(),
			},
		});
		await nextTick();
		const notice = panel.find(".cb-notice");
		expect(notice.text()).toContain("Auto-fix turn 1 of 2.");
		await buttonWithText(notice, "Show error").trigger("click");
		expect(notice.text()).toContain("TS2339");
		await buttonWithText(notice, "Stop auto-fix").trigger("click");
		expect(sentOfType(harness, "stop_autofix")).toHaveLength(1);
	});

	it("says the agent can't run, with no fallback, and points to the settings", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, {
			type: "settings_update",
			settings: {
				provider: "codex",
				mode: "normal",
				thinking: "medium",
				generationMode: "safe",
				allowLocalSkills: false,
			},
			providers: {
				claude: { available: true },
				codex: { available: false, reason: "Sign in with ChatGPT." },
			},
		});
		await nextTick();
		const notice = panel.find(".cb-provider");
		expect(notice.text()).toContain("Codex can't run.");
		expect(panel.find("textarea").attributes("disabled")).toBeDefined();
		await buttonWithText(notice, "Open settings").trigger("click");
		expect(harness.navigate).toHaveBeenCalledWith("/modules/ai/settings");
	});

	it("stops the turn with Esc", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "go");
		keydown(panel.find("textarea").element, "Escape");
		expect(sentOfType(harness, "interrupt_turn")).toHaveLength(1);
	});
});

describe("the history drawer", () => {
	const LIST = {
		type: "conversation_list",
		conversations: [
			{
				id: "c-run",
				title: "Add top customers",
				createdAtMs: 1,
				updatedAtMs: Date.now(),
				messageCount: 4,
				isRunning: true,
				filesChanged: 2,
				totalTokens: 9_600,
			},
			{
				id: "c-old",
				title: "Why is order pending?",
				createdAtMs: 1,
				updatedAtMs: Date.now() - 3_600_000,
				messageCount: 2,
				filesChanged: 0,
				filesUndone: 1,
				totalTokens: 1_300,
			},
		],
	};

	it("opens with ⌘J, pins the running chat, and switches chats", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "j", metaKey: true }),
		);
		deliver(harness, LIST);
		await nextTick();
		const drawer = panel.find(".cb-drawer");
		expect(
			drawer.findAll(".cb-drawer__group").map((group) => group.text()),
		).toEqual(["Active · 1", "Today"]);
		expect(drawer.text()).toContain("9.6k tok");
		expect(drawer.text()).toContain("1 file undone");
		await buttonWithText(drawer, "Why is order pending?").trigger("click");
		expect(sentOfType(harness, "leave_conversation")[0]).toMatchObject({
			conversationId: CONVERSATION_ID,
		});
		expect(sentOfType(harness, "hello").at(-1)).toMatchObject({
			conversationId: "c-old",
		});
	});

	it("deletes after 8 seconds unless undone, and asks first for a running chat", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		const panel = await openPanel(harness);
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "j", ctrlKey: true }),
		);
		deliver(harness, LIST);
		await nextTick();
		await panel
			.findAll('button[aria-label="Delete conversation"]')[1]
			.trigger("click");
		expect(panel.find(".cb-toast").text()).toContain(
			"Deleted “Why is order pending?”",
		);
		await buttonWithText(panel.find(".cb-toast"), "Undo").trigger("click");
		await vi.advanceTimersByTimeAsync(9_000);
		expect(sentOfType(harness, "delete_conversation")).toEqual([]);
		await panel
			.findAll('button[aria-label="Delete conversation"]')[1]
			.trigger("click");
		await vi.advanceTimersByTimeAsync(9_000);
		expect(sentOfType(harness, "delete_conversation")).toEqual([
			{ type: "delete_conversation", conversationId: "c-old" },
		]);
		await panel
			.findAll('button[aria-label="Delete conversation"]')[0]
			.trigger("click");
		await buttonWithText(panel.find(".u-modal"), "Stop and delete").trigger(
			"click",
		);
		expect(sentOfType(harness, "interrupt_turn")).toEqual([
			{ type: "interrupt_turn", conversationId: "c-run" },
		]);
	});
});

describe("the dashboard can open the panel on a chat", () => {
	it("starts a new chat with a prefilled composer", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		harness.session.startConversation("Add a refund chart");
		await flushPromises();
		expect((panel.find("textarea").element as HTMLTextAreaElement).value).toBe(
			"Add a refund chart",
		);
		expect(sentOfType(harness, "hello").at(-1)?.conversationId).not.toBe(
			CONVERSATION_ID,
		);
	});

	it("opens a stored chat", async () => {
		const harness = createHarness();
		await openPanel(harness);
		harness.session.openConversation("c-42");
		await nextTick();
		expect(sentOfType(harness, "hello").at(-1)).toMatchObject({
			conversationId: "c-42",
		});
	});
});
