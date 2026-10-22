import type { DiffHunk, DiffLine } from "../types/protocol";

type DiffRowKind = "hunk" | "context" | "add" | "remove";

/** One line of a unified diff as drawn: number, sign, text. */
export interface DiffRow {
	key: string;
	kind: DiffRowKind;
	/** The line's number in the file it belongs to: new for added and context, old for removed. */
	number: string;
	sign: string;
	text: string;
}

const SIGN_BY_KIND: Record<DiffLine["kind"], string> = {
	context: "",
	add: "+",
	remove: "−",
};

function lineNumber(line: DiffLine): string {
	const value = line.kind === "remove" ? line.oldLine : line.newLine;
	return value === undefined ? "" : String(value);
}

function hunkHeader(hunk: DiffHunk): string {
	return `@@ −${hunk.oldStart} +${hunk.newStart} @@`;
}

/**
 * Rows of a unified diff with line numbers, each hunk led by its header.
 * Numbers the sidecar left out are counted from the hunk's start.
 */
export function diffRows(hunks: readonly DiffHunk[]): DiffRow[] {
	return hunks.flatMap((hunk, hunkIndex) => {
		let oldLine = hunk.oldStart;
		let newLine = hunk.newStart;
		const header: DiffRow = {
			key: `h${hunkIndex}`,
			kind: "hunk",
			number: "",
			sign: "",
			text: hunkHeader(hunk),
		};
		const lines = hunk.lines.map((line, lineIndex): DiffRow => {
			const numbered: DiffLine = {
				...line,
				oldLine: line.oldLine ?? (line.kind === "add" ? undefined : oldLine),
				newLine: line.newLine ?? (line.kind === "remove" ? undefined : newLine),
			};
			if (line.kind !== "add") oldLine += 1;
			if (line.kind !== "remove") newLine += 1;
			return {
				key: `h${hunkIndex}l${lineIndex}`,
				kind: line.kind,
				number: lineNumber(numbered),
				sign: SIGN_BY_KIND[line.kind],
				text: line.text,
			};
		});
		return [header, ...lines];
	});
}

export interface LimitedRows {
	rows: DiffRow[];
	/** How many more rows the full diff has. */
	hidden: number;
}

/** The first `limit` rows of a diff. */
export function limitRows(
	rows: readonly DiffRow[],
	limit: number,
): LimitedRows {
	if (rows.length <= limit) return { rows: [...rows], hidden: 0 };
	return { rows: rows.slice(0, limit), hidden: rows.length - limit };
}
