// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DiffView from "../../app/views/DiffView.vue";
import type { DiffFile } from "../../app/views/types";
import {
	countLines,
	hunkHeader,
	renderHunks,
} from "../../app/views/utils/diff";

const PAGE_FILE: DiffFile = {
	path: "src/modules/sales/pages/overview.page.ts",
	status: "modified",
	added: 2,
	removed: 1,
	hunks: [
		{
			oldStart: 38,
			newStart: 38,
			lines: [
				{
					kind: "context",
					text: "  static revenue = ChartCard();",
					oldLine: 38,
					newLine: 38,
				},
				{ kind: "remove", text: "  static latest = TableView();", oldLine: 39 },
				{ kind: "add", text: "  static top = TopListCard();", newLine: 39 },
				{ kind: "add", text: "  static latest = TableView();", newLine: 40 },
			],
		},
	],
};

const NEW_FILE: DiffFile = {
	path: "src/modules/sales/queries/top-customers.ts",
	status: "added",
	hunks: [
		{
			oldStart: 0,
			newStart: 1,
			lines: [{ kind: "add", text: "export const top = 5;", newLine: 1 }],
		},
	],
};

const STUBS = {
	UIcon: true,
	UButton: {
		props: ["ariaLabel", "icon"],
		emits: ["click"],
		template: `<button :aria-label="ariaLabel" @click="$emit('click')" />`,
	},
	DmsStatusPill: {
		props: ["label"],
		template: `<span data-pill>{{ label }}</span>`,
	},
};

function mountDiff(files: DiffFile[]) {
	return mount(DiffView, { props: { files }, global: { stubs: STUBS } });
}

beforeEach(() => {
	vi.stubGlobal("useI18n", () => ({
		t: (key: string, params?: Record<string, unknown>) =>
			params?.path ? `${key}:${String(params.path)}` : key,
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("diff utils", () => {
	it("writes a unified hunk header from the hunk's lines", () => {
		expect(hunkHeader(PAGE_FILE.hunks[0]!)).toBe("@@ -38,2 +38,3 @@");
	});

	it("counts added and removed lines", () => {
		expect(countLines(PAGE_FILE.hunks)).toEqual({ added: 2, removed: 1 });
	});

	it("numbers removed lines on the old side and the rest on the new side", () => {
		const lines = renderHunks(PAGE_FILE.hunks);
		expect(lines.map((line) => [line.kind, line.number, line.marker])).toEqual([
			["hunk", "", ""],
			["context", "38", ""],
			["remove", "39", "−"],
			["add", "39", "+"],
			["add", "40", "+"],
		]);
	});
});

describe("DiffView", () => {
	it("draws each file with its directory, name and counts", () => {
		const wrapper = mountDiff([PAGE_FILE]);
		const header = wrapper.get("[data-diff-file] header");
		expect(header.text()).toContain("src/modules/sales/pages/");
		expect(header.get("b").text()).toBe("overview.page.ts");
		expect(header.text()).toContain("+2");
		expect(header.text()).toContain("−1");
	});

	it("colours lines by kind and keeps their text verbatim", () => {
		const wrapper = mountDiff([PAGE_FILE]);
		const kinds = wrapper
			.findAll("[data-line-kind]")
			.map((row) => row.attributes("data-line-kind"));
		expect(kinds).toEqual(["hunk", "context", "remove", "add", "add"]);
		const removed = wrapper.get('[data-line-kind="remove"]');
		expect(removed.classes().join(" ")).toContain("error");
		expect(removed.findAll("span").at(2)?.text()).toBe(
			"static latest = TableView();",
		);
		expect(wrapper.get('[data-line-kind="add"]').classes().join(" ")).toContain(
			"success",
		);
	});

	it("marks a new file and derives its counts from the hunks", () => {
		const wrapper = mountDiff([NEW_FILE]);
		expect(wrapper.get("[data-pill]").text()).toBe("dms_ai.views.diff.new");
		expect(wrapper.get("header").text()).toContain("+1");
	});

	it("collapses and expands a file", async () => {
		const wrapper = mountDiff([PAGE_FILE]);
		expect(wrapper.findAll("[data-line-kind]")).toHaveLength(5);
		await wrapper.get("header button").trigger("click");
		expect(wrapper.findAll("[data-line-kind]")).toHaveLength(0);
		await wrapper.get("header button").trigger("click");
		expect(wrapper.findAll("[data-line-kind]")).toHaveLength(5);
	});

	it("says so for a binary file instead of drawing lines", () => {
		const wrapper = mountDiff([
			{
				path: "public/logo.png",
				status: "modified",
				hunks: [],
				isBinary: true,
			},
		]);
		expect(wrapper.text()).toContain("dms_ai.views.diff.binary");
		expect(wrapper.findAll("[data-line-kind]")).toHaveLength(0);
	});
});
