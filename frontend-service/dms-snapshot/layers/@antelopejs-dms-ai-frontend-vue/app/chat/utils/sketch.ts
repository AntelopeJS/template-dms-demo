import {
	SKETCH_BASE_CSS,
	SKETCH_CSP,
	SKETCH_TOKENS,
	type SketchScheme,
	type SketchToken,
	UNSAFE_TOKEN_VALUE,
} from "../constants/sketch";
import type { PreviewSketch } from "../types/protocol";

/** Reads a dashboard variable; unset or unsafe values give the token's default. */
export type TokenReader = (variable: string) => string;

function tokenValue(
	token: SketchToken,
	scheme: SketchScheme,
	read: TokenReader,
): string {
	const value = read(token.source).trim();
	if (value === "" || UNSAFE_TOKEN_VALUE.test(value)) return token[scheme];
	return value;
}

/** The `:root` rule giving a sandboxed sketch the dashboard's theme. */
export function sketchTokensCss(
	scheme: SketchScheme,
	read: TokenReader,
): string {
	const declarations = SKETCH_TOKENS.map(
		(token) => `--sketch-${token.name}:${tokenValue(token, scheme, read)};`,
	);
	return `:root{--sketch-scheme:${scheme};${declarations.join("")}}`;
}

export function computedStyleReader(element: Element): TokenReader {
	const style = getComputedStyle(element);
	return (variable) => style.getPropertyValue(variable);
}

/**
 * The standalone document a sketch is drawn in. The CSP comes first in the
 * head, before anything the agent wrote, so no later markup can loosen it.
 */
export function buildSketchDocument(
	sketch: PreviewSketch,
	tokensCss: string,
): string {
	return [
		"<!doctype html><html><head>",
		`<meta http-equiv="Content-Security-Policy" content="${SKETCH_CSP}">`,
		'<meta charset="utf-8">',
		`<style>${tokensCss}\n${SKETCH_BASE_CSS}</style>`,
		`<style>${sketch.css ?? ""}</style>`,
		`</head><body>${sketch.html}</body></html>`,
	].join("");
}
