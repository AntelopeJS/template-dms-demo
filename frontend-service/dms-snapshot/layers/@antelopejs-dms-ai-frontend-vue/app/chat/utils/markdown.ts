import DOMPurify, { type Config, type DOMPurify as Purifier } from "dompurify";
import MarkdownIt, { type Token } from "markdown-it";

const ALLOWED_TAGS = [
	"a",
	"blockquote",
	"br",
	"code",
	"del",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"li",
	"ol",
	"p",
	"pre",
	"s",
	"strong",
	"table",
	"tbody",
	"td",
	"th",
	"thead",
	"tr",
	"ul",
];

const ALLOWED_ATTR = ["href", "title", "target", "rel", "start"];

const SAFE_URL = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const SANITIZE_CONFIG: Config = {
	ALLOWED_TAGS,
	ALLOWED_ATTR,
	ALLOWED_URI_REGEXP: SAFE_URL,
	ALLOW_DATA_ATTR: false,
	ALLOW_ARIA_ATTR: false,
	ALLOW_UNKNOWN_PROTOCOLS: false,
};

const LINK_TARGET = "_blank";
const LINK_REL = "noopener noreferrer";
const NEWLINES = /\r\n?/g;
const LINE_BREAK = "\n";

const md = new MarkdownIt({
	html: false,
	linkify: true,
	breaks: true,
});

md.validateLink = (url) => SAFE_URL.test(url.trim());

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
	tokens[idx].attrSet("target", LINK_TARGET);
	tokens[idx].attrSet("rel", LINK_REL);
	return self.renderToken(tokens, idx, options);
};

function imageDestination(src: string): string {
	try {
		return new URL(src).host || src;
	} catch {
		return src;
	}
}

function imageLinkLabel(alt: string, src: string): string {
	const destination = imageDestination(src);
	return alt ? `${alt} (${destination})` : destination;
}

md.renderer.rules.image = (tokens, idx, options, env, self) => {
	const token = tokens[idx];
	const src = token.attrGet("src") ?? "";
	const alt = self.renderInlineAsText(token.children ?? [], options, env);
	const label = md.utils.escapeHtml(imageLinkLabel(alt, src));
	return `<a href="${md.utils.escapeHtml(src)}" target="${LINK_TARGET}" rel="${LINK_REL}">${label}</a>`;
};

let purifier: Purifier | null = null;

function getPurifier(): Purifier {
	if (purifier !== null) return purifier;
	purifier = DOMPurify(globalThis.window);
	purifier.addHook("afterSanitizeAttributes", (node) => {
		if (node.tagName !== "A" || !node.hasAttribute("href")) return;
		node.setAttribute("target", LINK_TARGET);
		node.setAttribute("rel", LINK_REL);
	});
	return purifier;
}

function sanitize(html: string): string {
	return getPurifier().sanitize(html, SANITIZE_CONFIG);
}

function normalize(source: string): string {
	return (source ?? "").replace(NEWLINES, LINE_BREAK);
}

/** Model output as sanitized HTML, whole. */
export function renderMarkdown(source: string): string {
	return sanitize(md.render(normalize(source)));
}

interface TopLevelBlock {
	tokens: Token[];
	startLine: number;
}

function splitTopLevelBlocks(tokens: Token[]): TopLevelBlock[] {
	const blocks: TopLevelBlock[] = [];
	for (const token of tokens) {
		const map = token.map;
		const opensBlock =
			token.level === 0 && token.nesting !== -1 && map !== null;
		if (opensBlock) blocks.push({ tokens: [token], startLine: map[0] });
		else blocks.at(-1)?.tokens.push(token);
	}
	return blocks;
}

function lineOffset(text: string, line: number): number {
	let offset = 0;
	for (let index = 0; index < line; index += 1) {
		const next = text.indexOf(LINE_BREAK, offset);
		if (next === -1) return text.length;
		offset = next + 1;
	}
	return offset;
}

interface MarkdownBlocks {
	/** Top-level blocks that the text still to come can no longer change. */
	settled: readonly string[];
	/** The last block, which the next text may still extend. */
	open: string;
}

export interface IncrementalMarkdown {
	/** Renders `source`, reusing the settled blocks of the text it extends. */
	render: (source: string) => MarkdownBlocks;
}

interface IncrementalState {
	settledSource: string;
	settled: string[];
	env: Record<string, unknown>;
}

function renderBlock(block: TopLevelBlock, state: IncrementalState): string {
	return sanitize(md.renderer.render(block.tokens, md.options, state.env));
}

function renderIncrement(
	state: IncrementalState,
	text: string,
): MarkdownBlocks {
	if (!text.startsWith(state.settledSource)) {
		state.settledSource = "";
		state.settled = [];
		state.env = {};
	}
	const rest = text.slice(state.settledSource.length);
	const blocks = splitTopLevelBlocks(md.parse(rest, state.env));
	const open = blocks.pop();
	if (open === undefined) return { settled: [...state.settled], open: "" };
	for (const block of blocks) state.settled.push(renderBlock(block, state));
	state.settledSource += rest.slice(0, lineOffset(rest, open.startLine));
	return { settled: [...state.settled], open: renderBlock(open, state) };
}

/**
 * Renders a message while it streams at a cost bounded by its last block: a
 * top-level block is settled once markdown-it starts the next one, and is then
 * rendered and sanitized once. Re-rendering the whole message on every chunk
 * made a long answer quadratic, on the dashboard's own thread.
 */
export function createIncrementalMarkdown(): IncrementalMarkdown {
	const state: IncrementalState = { settledSource: "", settled: [], env: {} };
	return { render: (source) => renderIncrement(state, normalize(source)) };
}
