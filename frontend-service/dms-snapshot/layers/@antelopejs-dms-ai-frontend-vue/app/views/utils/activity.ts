import type {
	ActivityDetailPayload,
	ActivityResult,
	ActivityRow,
} from "../types";

/** A named argument as DmsKeyValueList draws it. */
export interface ArgumentItem {
	id: string;
	label: string;
	value: string;
	type: "mono";
	/** The whole value, which the row's copy button copies. */
	copyValue: string;
}

const MAX_ARGUMENT_CHARS = 240;
const ELLIPSIS = "…";
const JSON_INDENT = 2;
const OUTCOMES: ReadonlySet<string> = new Set<ActivityResult>([
	"done",
	"failed",
	"denied",
	"blocked",
	"stopped",
	"pending",
	"expired",
]);

function shorten(text: string): string {
	if (text.length <= MAX_ARGUMENT_CHARS) return text;
	return `${text.slice(0, MAX_ARGUMENT_CHARS - ELLIPSIS.length)}${ELLIPSIS}`;
}

function stringifyArgument(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === undefined) return "";
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/** A call's arguments, one row per name, long values cut short but copied whole. */
export function argumentItems(
	args: Record<string, unknown> | undefined,
): ArgumentItem[] {
	return Object.entries(args ?? {}).map(([name, value]) => {
		const text = stringifyArgument(value);
		return {
			id: name,
			label: name,
			value: shorten(text),
			type: "mono",
			copyValue: text,
		};
	});
}

/** The call's output text, whichever key the route sent it under. */
export function activityOutput(
	detail: ActivityDetailPayload | null,
): string | undefined {
	if (!detail) return undefined;
	if (detail.output) return detail.output;
	const result = detail.result;
	return result && !OUTCOMES.has(result) ? result : undefined;
}

/** Everything known about the call, for the raw JSON toggle. */
export function rawActivityJson(
	row: ActivityRow | undefined,
	detail: ActivityDetailPayload | null,
): string {
	return JSON.stringify({ ...row, ...detail }, null, JSON_INDENT);
}
