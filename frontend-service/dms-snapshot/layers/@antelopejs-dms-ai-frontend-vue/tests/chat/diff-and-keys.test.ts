import { describe, expect, it } from "vitest";
import {
	approvalKeyAction,
	type ApprovalKeyInput,
	stepIndex,
} from "../../app/chat/utils/approval-keyboard";
import { diffRows, limitRows } from "../../app/chat/utils/diff";
import { moveItem } from "../../app/chat/utils/queue";
import {
	conversationTime,
	groupConversations,
} from "../../app/chat/utils/conversation-groups";
import { formatDuration, formatTokens } from "../../app/chat/utils/format";
import type { ConversationSummary } from "../../app/chat/types/conversation";

describe("a diff is drawn with line numbers", () => {
	const rows = diffRows([
		{
			oldStart: 41,
			newStart: 41,
			lines: [
				{ kind: "context", text: "  vatNumber: InputText({" },
				{ kind: "remove", text: '    label: "VAT",' },
				{ kind: "add", text: '    label: "VAT number",' },
				{ kind: "add", text: "    validate: check," },
				{ kind: "context", text: "  })" },
			],
		},
	]);

	it("leads each hunk with its header", () => {
		expect(rows[0]).toMatchObject({ kind: "hunk", text: "@@ −41 +41 @@" });
	});

	it("numbers removed lines in the old file and the rest in the new one", () => {
		expect(
			rows.slice(1).map((row) => [row.kind, row.number, row.sign]),
		).toEqual([
			["context", "41", ""],
			["remove", "42", "−"],
			["add", "42", "+"],
			["add", "43", "+"],
			["context", "44", ""],
		]);
	});

	it("keeps numbers the sidecar sent", () => {
		const [, line] = diffRows([
			{
				oldStart: 1,
				newStart: 1,
				lines: [{ kind: "add", text: "x", newLine: 9 }],
			},
		]);
		expect(line.number).toBe("9");
	});

	it("shows the first rows of a long diff and counts the rest", () => {
		expect(limitRows(rows, 4)).toMatchObject({ hidden: 2 });
		expect(limitRows(rows, 10).hidden).toBe(0);
	});
});

describe("the approvals dock answers to the keyboard", () => {
	const key = (value: string, extra: Partial<ApprovalKeyInput> = {}) =>
		approvalKeyAction({
			key: value,
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			isTextTarget: false,
			...extra,
		});

	it("maps ↵, N, J and K", () => {
		expect(key("Enter")).toBe("allow");
		expect(key("n")).toBe("deny");
		expect(key("N")).toBe("deny");
		expect(key("j")).toBe("next");
		expect(key("k")).toBe("previous");
		expect(key("x")).toBeNull();
	});

	it("leaves text fields and shortcuts alone", () => {
		expect(key("n", { isTextTarget: true })).toBeNull();
		expect(key("k", { metaKey: true, shiftKey: true })).toBeNull();
		expect(key("Enter", { shiftKey: true })).toBeNull();
	});

	it("wraps around the requests", () => {
		expect(stepIndex(1, 1, 2)).toBe(0);
		expect(stepIndex(0, -1, 2)).toBe(1);
		expect(stepIndex(0, 1, 0)).toBe(0);
	});
});

describe("the queue reorders in place", () => {
	const queue = [{ id: "a" }, { id: "b" }, { id: "c" }];

	it("moves an item to its new index", () => {
		expect(moveItem(queue, "c", 0).map((item) => item.id)).toEqual([
			"c",
			"a",
			"b",
		]);
		expect(moveItem(queue, "a", 9).map((item) => item.id)).toEqual([
			"b",
			"c",
			"a",
		]);
		expect(moveItem(queue, "z", 0)).toEqual(queue);
	});
});

describe("the history drawer groups and dates chats", () => {
	const now = new Date(2026, 9, 7, 15, 0).getTime();
	const chat = (
		id: string,
		updatedAtMs: number,
		extra = {},
	): ConversationSummary => ({
		id,
		title: id,
		createdAtMs: updatedAtMs,
		updatedAtMs,
		messageCount: 1,
		...extra,
	});

	it("pins working and waiting chats above Today, This week and Older", () => {
		const groups = groupConversations(
			[
				chat("old", new Date(2026, 8, 1).getTime()),
				chat("today", now - 3_600_000),
				chat("week", now - 3 * 86_400_000),
				chat("waiting", now - 30 * 86_400_000, { pendingApprovals: 2 }),
				chat("running", now - 60_000, { isRunning: true }),
			],
			now,
		);
		expect(
			groups.map((group) => [group.key, group.items.map((i) => i.id)]),
		).toEqual([
			["active", ["running", "waiting"]],
			["today", ["today"]],
			["week", ["week"]],
			["older", ["old"]],
		]);
	});

	it("filters by title", () => {
		const groups = groupConversations(
			[chat("VAT check", now), chat("Refunds", now)],
			now,
			"vat",
		);
		expect(groups.flatMap((group) => group.items.map((i) => i.id))).toEqual([
			"VAT check",
		]);
	});

	it("says now, minutes, then a time", () => {
		expect(conversationTime(now - 10_000, now, "en-GB", "now")).toBe("now");
		expect(conversationTime(now - 120_000, now, "en-GB", "now")).toBe("2m");
		expect(conversationTime(now - 2 * 3_600_000, now, "en-GB", "now")).toBe(
			"13:00",
		);
	});

	it("formats tokens and durations compactly", () => {
		expect(formatTokens(840)).toBe("840");
		expect(formatTokens(9_600)).toBe("9.6k");
		expect(formatTokens(22_000)).toBe("22k");
		expect(formatDuration(600)).toBe("0.6s");
		expect(formatDuration(72_000)).toBe("1:12");
	});
});
