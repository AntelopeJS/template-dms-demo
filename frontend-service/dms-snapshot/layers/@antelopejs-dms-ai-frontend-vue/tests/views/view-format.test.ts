import { describe, expect, it } from "vitest";
import { formatMoment, type MomentOptions } from "../../app/views/utils/moment";
import {
	bareToolName,
	readableToolName,
	toolSource,
} from "../../app/views/utils/tools";

const NOW_MS = Date.UTC(2026, 8, 29, 15, 30);
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function options(): MomentOptions {
	return {
		format: (intlOptions) =>
			new Intl.DateTimeFormat("en-US", {
				...intlOptions,
				timeZone: "UTC",
				hourCycle: "h23",
			}),
		t: (key, params) => `${key.split(".").at(-1)} ${String(params?.time)}`,
		nowMs: NOW_MS,
	};
}

describe("formatMoment", () => {
	it("says today and yesterday with the time", () => {
		expect(formatMoment(NOW_MS - HOUR_MS, options())).toBe("today 14:30");
		expect(formatMoment(NOW_MS - DAY_MS, options())).toBe("yesterday 15:30");
	});

	it("names the weekday within the week, then the day", () => {
		expect(formatMoment(NOW_MS - 3 * DAY_MS, options())).toBe("Sat 15:30");
		expect(formatMoment(NOW_MS - 10 * DAY_MS, options())).toBe("Sep 19");
		expect(formatMoment(NOW_MS - 400 * DAY_MS, options())).toBe("Aug 25, 2025");
	});
});

describe("tool names", () => {
	it("drops the MCP namespace", () => {
		expect(bareToolName("mcp__dms-builder__BuilderAddBlock")).toBe(
			"BuilderAddBlock",
		);
	});

	it("writes an unknown tool as words", () => {
		expect(readableToolName("mcp__dms-builder__BuilderAddBlock")).toBe(
			"Add block",
		);
		expect(readableToolName("command_execution")).toBe("Command execution");
	});

	it("places a tool in its source", () => {
		expect(toolSource("mcp__dms-builder__BuilderAddBlock")).toBe("builder");
		expect(toolSource("Edit")).toBe("code");
		expect(toolSource("WebFetch")).toBe("web");
		expect(toolSource("Something")).toBe("assistant");
	});
});
