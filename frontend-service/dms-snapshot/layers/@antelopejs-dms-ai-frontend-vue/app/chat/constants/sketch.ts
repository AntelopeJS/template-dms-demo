/**
 * How an agent's sketch is drawn. The frame is the security boundary: an empty
 * `sandbox` (no scripts, opaque origin, no forms, popups or top navigation)
 * and a CSP that loads nothing but inline styles and `data:` images and fonts.
 */
export const SKETCH_CSP =
	"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

/** Mirror of the sidecar's default (sidecar/src/constants/preview.ts). */
export const SKETCH_DEFAULT_HEIGHT_PX = 320;

export type SketchScheme = "light" | "dark";

/** Class the dashboard puts on `<html>` in its dark theme. */
export const DARK_THEME_CLASS = "dark";

/**
 * The `--sketch-*` tokens a sketch's CSS may use, read from the dashboard's
 * own variables (a sandboxed document inherits none of them), with the
 * dashboard's default values when a variable is unset.
 */
export interface SketchToken {
	name: string;
	source: string;
	light: string;
	dark: string;
}

const SANS_STACK =
	'"Geist", "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif';
const MONO_STACK = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';

export const SKETCH_TOKENS: readonly SketchToken[] = [
	{
		name: "canvas",
		source: "--ui-bg-muted",
		light: "#f4f6f7",
		dark: "#07090b",
	},
	{
		name: "surface",
		source: "--dms-surface-card",
		light: "#ffffff",
		dark: "#10151a",
	},
	{
		name: "surface-muted",
		source: "--dms-bg-muted",
		light: "#f7f9fa",
		dark: "#0d1114",
	},
	{ name: "border", source: "--ui-border", light: "#e2e7ea", dark: "#262e36" },
	{ name: "text", source: "--ui-text", light: "#2a333b", dark: "#c7d0d8" },
	{
		name: "text-strong",
		source: "--ui-text-highlighted",
		light: "#0b1114",
		dark: "#eef3f6",
	},
	{
		name: "text-muted",
		source: "--ui-text-muted",
		light: "#49525b",
		dark: "#9ea7b0",
	},
	{ name: "accent", source: "--ui-primary", light: "#167f8a", dark: "#4dd9e6" },
	{
		name: "accent-fill",
		source: "--dms-accent-fill",
		light: "#4dd9e6",
		dark: "#4dd9e6",
	},
	{
		name: "success",
		source: "--ui-success",
		light: "#15803d",
		dark: "#4ade80",
	},
	{ name: "error", source: "--ui-error", light: "#b91c1c", dark: "#f87171" },
	{
		name: "radius",
		source: "--dms-radius-card",
		light: "0.875rem",
		dark: "0.875rem",
	},
	{ name: "font", source: "--font-sans", light: SANS_STACK, dark: SANS_STACK },
	{
		name: "font-mono",
		source: "--font-mono",
		light: MONO_STACK,
		dark: MONO_STACK,
	},
];

/** A dashboard value that could end the style element it is written into. */
export const UNSAFE_TOKEN_VALUE = /[<>{};]/;

/** Neutral base under the agent's CSS, so a bare sketch already looks native. */
export const SKETCH_BASE_CSS = `*,*::before,*::after{box-sizing:border-box}
html{color-scheme:var(--sketch-scheme);background:var(--sketch-canvas)}
body{margin:0;padding:16px;font:14px/1.5 var(--sketch-font);color:var(--sketch-text);-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0 0 .5em;color:var(--sketch-text-strong);line-height:1.25}
p{margin:0 0 .5em}
img,svg{max-width:100%}
code,kbd,pre{font-family:var(--sketch-font-mono)}`;
