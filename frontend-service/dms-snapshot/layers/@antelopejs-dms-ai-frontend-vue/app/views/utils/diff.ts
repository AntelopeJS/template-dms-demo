import type {
	ActivityDiffFile,
	DiffFile,
	DiffHunk,
	DiffLine,
	DiffLineKind,
} from "../types";

const PATH_SEPARATOR = "/";

export interface SplitPath {
	directory: string;
	name: string;
}

export interface LineCounts {
	added: number;
	removed: number;
}

/** A diff line as DiffView draws it: number, marker, text and its kind. */
export interface RenderedLine {
	key: string;
	kind: DiffLineKind | "hunk";
	number: string;
	marker: string;
	text: string;
}

const LINE_MARKERS: Record<DiffLineKind, string> = {
	context: "",
	add: "+",
	remove: "−",
};

/** Directory (with its trailing slash) and file name of a path. */
export function splitPath(path: string): SplitPath {
	const cut = path.lastIndexOf(PATH_SEPARATOR) + 1;
	return { directory: path.slice(0, cut), name: path.slice(cut) };
}

export function countLines(hunks: DiffHunk[]): LineCounts {
	const lines = hunks.flatMap((hunk) => hunk.lines);
	return {
		added: lines.filter((line) => line.kind === "add").length,
		removed: lines.filter((line) => line.kind === "remove").length,
	};
}

function hunkLength(hunk: DiffHunk, side: DiffLineKind): number {
	return hunk.lines.filter((line) => line.kind !== side).length;
}

/** The `@@ -38,7 +38,20 @@` line heading a hunk. */
export function hunkHeader(hunk: DiffHunk): string {
	const oldLength = hunkLength(hunk, "add");
	const newLength = hunkLength(hunk, "remove");
	return `@@ -${hunk.oldStart},${oldLength} +${hunk.newStart},${newLength} @@`;
}

function lineNumber(line: DiffLine): string {
	const number = line.kind === "remove" ? line.oldLine : line.newLine;
	return number === undefined ? "" : String(number);
}

function renderLine(line: DiffLine, key: string): RenderedLine {
	return {
		key,
		kind: line.kind,
		number: lineNumber(line),
		marker: LINE_MARKERS[line.kind],
		text: line.text,
	};
}

/**
 * Every line of a file's hunks, each hunk led by its header, numbered on the
 * new side (the old side for removed lines), like a unified diff.
 */
export function renderHunks(hunks: DiffHunk[]): RenderedLine[] {
	return hunks.flatMap((hunk, hunkIndex) => [
		{
			key: `h${hunkIndex}`,
			kind: "hunk" as const,
			number: "",
			marker: "",
			text: hunkHeader(hunk),
		},
		...hunk.lines.map((line, lineIndex) =>
			renderLine(line, `h${hunkIndex}l${lineIndex}`),
		),
	]);
}

/** The diff an activity row produced, with the counts DiffView shows. */
export function toDiffFiles(files: ActivityDiffFile[]): DiffFile[] {
	return files.map((file) => ({ ...file, ...countLines(file.hunks) }));
}
