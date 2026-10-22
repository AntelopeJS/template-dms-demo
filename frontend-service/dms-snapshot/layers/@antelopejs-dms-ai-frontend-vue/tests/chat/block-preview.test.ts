// @vitest-environment jsdom
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, type PropType, ref } from "vue";
import BlockPreviewCard from "../../app/chat/components/BlockPreviewCard.vue";
import { useConversation } from "../../app/chat/composables/useConversation";
import { CHAT_I18N_KEY } from "../../app/chat/composables/useChatI18n";
import type { ConversationMessage } from "../../app/chat/types/conversation";
import type { BlockPreview } from "../../app/chat/types/protocol";
import {
	countBlocks,
	previewTabs,
	referenceView,
	type ReferenceView,
} from "../../app/chat/utils/block-preview";
import { buildUserMessage } from "../../app/chat/utils/conversation-messages";
import {
	buildSketchDocument,
	sketchTokensCss,
} from "../../app/chat/utils/sketch";
import { createTestI18n } from "../support/i18n";
import { PANEL_STUBS } from "../support/stubs";

const CONVERSATION_ID = "conv-1";
const MOCKUP_NAME = "mockup.png";
const MOCKUP_DATA_URL = "data:image/png;base64,AAAA";

const PREVIEW: BlockPreview = {
	id: "preview-1",
	title: "Revenue card",
	description: "Same layout; the trend sits under the value.",
	tree: {
		type: "Section",
		children: [
			{ type: "KpiCard", options: { label: "Revenue" } },
			{ type: "KpiCard", options: { label: "Orders" } },
		],
	},
	timestampMs: 1_000,
};

const WITH_VARIANTS: BlockPreview = {
	...PREVIEW,
	variants: [
		{ label: "Compact", tree: [{ type: "KpiCard", options: { size: "sm" } }] },
	],
};

const SKETCH = {
	html: '<article class="card"><h3>Revenue</h3><p>12 400 €</p></article>',
	css: ".card { background: var(--sketch-surface); }",
	caption: "Revenue card with a sparkline",
	height: 240,
};

const DMS_VS_SKETCH: BlockPreview = {
	id: "preview-2",
	title: "Revenue card: DMS or custom",
	label: "DMS KpiCard",
	tree: { type: "KpiCard", options: { label: "Revenue" } },
	variants: [{ label: "Custom sketch", sketch: SKETCH }],
	timestampMs: 2_000,
};

const SKETCH_ONLY: BlockPreview = {
	id: "preview-3",
	title: "Custom revenue card",
	sketch: SKETCH,
	timestampMs: 3_000,
};

const UTabs = defineComponent({
	name: "UTabs",
	props: {
		modelValue: { type: String, default: "" },
		items: {
			type: Array as PropType<{ value: string; label: string }[]>,
			default: () => [],
		},
	},
	emits: ["update:modelValue"],
	setup:
		(props, { emit, attrs }) =>
		() =>
			h(
				"div",
				{ role: "tablist", "aria-label": attrs["aria-label"] },
				props.items.map((item) =>
					h(
						"button",
						{
							role: "tab",
							"aria-selected": item.value === props.modelValue,
							onClick: () => emit("update:modelValue", item.value),
						},
						item.label,
					),
				),
			),
});

const DmsBlockPreview = defineComponent({
	name: "DmsBlockPreview",
	props: { tree: { type: [Object, Array], required: true } },
	setup: (props) => () =>
		h("div", { class: "dms-block-preview" }, JSON.stringify(props.tree)),
});

interface MountOptions {
	preview?: BlockPreview;
	reference?: ReferenceView | null;
	hasPreviewComponent?: boolean;
}

function mountCard(options: MountOptions = {}): VueWrapper {
	return mount(BlockPreviewCard, {
		props: {
			preview: options.preview ?? PREVIEW,
			reference: options.reference ?? null,
		},
		global: {
			stubs: { ...PANEL_STUBS, UTabs },
			components:
				options.hasPreviewComponent === false ? {} : { DmsBlockPreview },
			provide: { [CHAT_I18N_KEY as symbol]: createTestI18n() },
		},
	});
}

async function openModal(wrapper: VueWrapper): Promise<void> {
	await wrapper.find("button.bp-card").trigger("click");
}

describe("block preview helpers", () => {
	it("counts nested blocks", () => {
		expect(countBlocks(PREVIEW.tree)).toBe(3);
	});

	it("puts the proposed tree first, then one tab per variant", () => {
		const tabs = previewTabs(WITH_VARIANTS);
		expect(tabs.map((tab) => tab.label)).toEqual([null, "Compact"]);
		expect(tabs[1].tree).toEqual(WITH_VARIANTS.variants?.[0].tree);
	});

	it("finds the mockup among the images attached in this session", () => {
		const messages: ConversationMessage[] = [
			buildUserMessage("like this", [
				{
					name: MOCKUP_NAME,
					mimeType: "image/png",
					size: 4,
					dataUrl: MOCKUP_DATA_URL,
				},
			]),
		];
		expect(referenceView({ attachmentName: MOCKUP_NAME }, messages)).toEqual({
			kind: "image",
			src: MOCKUP_DATA_URL,
			name: MOCKUP_NAME,
		});
	});

	it("says the mockup is gone when only its name survived a reload", () => {
		const messages = [
			buildUserMessage("like this", [
				{ name: MOCKUP_NAME, mimeType: "image/png", size: 4 },
			]),
		];
		expect(referenceView({ attachmentName: MOCKUP_NAME }, messages)).toEqual({
			kind: "missing",
			name: MOCKUP_NAME,
		});
	});

	it("loads a same-origin path, links an external URL, ignores the rest", () => {
		expect(referenceView({ url: "/media/a.png" }, [])?.kind).toBe("image");
		expect(referenceView({ url: "https://x.example/a.png" }, [])?.kind).toBe(
			"link",
		);
		expect(referenceView({ url: "//x.example/a.png" }, [])).toBeNull();
		expect(referenceView({ url: "javascript:alert(1)" }, [])).toBeNull();
	});
});

describe("block preview events", () => {
	function conversation() {
		const handlers: ((msg: unknown) => void)[] = [];
		const result = useConversation({
			activeId: ref(CONVERSATION_ID),
			send: () => true,
			onMessage: (handler) => {
				handlers.push(handler);
				return () => undefined;
			},
		});
		const receive = (event: Record<string, unknown>) =>
			handlers.forEach((handler) =>
				handler({ conversationId: CONVERSATION_ID, ...event }),
			);
		return { ...result, receive };
	}

	it("appends a live preview once", () => {
		const chat = conversation();
		chat.receive({ type: "block_preview", preview: PREVIEW });
		chat.receive({ type: "block_preview", preview: PREVIEW });
		expect(chat.messages.value).toHaveLength(1);
		expect(chat.messages.value[0]).toMatchObject({
			role: "block_preview",
			preview: PREVIEW,
		});
	});

	it("restores a preview from the stored transcript", () => {
		const chat = conversation();
		chat.receive({
			type: "conversation_snapshot",
			messages: [
				{ role: "user", content: "show me", timestampMs: 1 },
				{
					role: "block_preview",
					content: "",
					preview: PREVIEW,
					timestampMs: 2,
				},
			],
		});
		expect(chat.messages.value.map((m) => m.role)).toEqual([
			"user",
			"block_preview",
		]);
	});

	it("keeps the preview when a running turn is replayed", () => {
		const chat = conversation();
		chat.receive({
			type: "conversation_snapshot",
			messages: [{ role: "user", content: "show me", timestampMs: 1 }],
		});
		chat.receive({ type: "block_preview", preview: PREVIEW });
		chat.receive({ type: "run_resumed" });
		expect(chat.messages.value.at(-1)?.role).toBe("block_preview");
	});
});

describe("the block preview attachment", () => {
	it("reads as a file: thumbnail, title, what it holds", () => {
		const wrapper = mountCard({ preview: WITH_VARIANTS });
		const card = wrapper.find("button.bp-card");
		expect(card.attributes("aria-haspopup")).toBe("dialog");
		expect(card.attributes("aria-label")).toBe(
			"Open the block preview: Revenue card",
		);
		expect(wrapper.find(".bp-thumb .dms-block-preview").exists()).toBe(true);
		expect(wrapper.find(".bp-card__meta").text()).toBe(
			"Section · 3 blocks · 2 variants",
		);
	});

	it("draws a schematic thumbnail when the DMS has no preview component", () => {
		const wrapper = mountCard({ hasPreviewComponent: false });
		expect(wrapper.findAll(".bp-thumb__cell")).toHaveLength(2);
	});

	it("opens a dialog rendering the real blocks", async () => {
		const wrapper = mountCard();
		expect(wrapper.find("[role=dialog]").exists()).toBe(false);
		await openModal(wrapper);
		const dialog = wrapper.find("[role=dialog]");
		expect(dialog.text()).toContain("Revenue card");
		expect(dialog.find(".bp-pane__stage .dms-block-preview").text()).toBe(
			JSON.stringify(PREVIEW.tree),
		);
		expect(dialog.find(".bp-fallback").exists()).toBe(false);
	});

	it("shows the tree as JSON when the DMS cannot render it", async () => {
		const wrapper = mountCard({ hasPreviewComponent: false });
		await openModal(wrapper);
		const fallback = wrapper.find(".bp-fallback");
		expect(fallback.text()).toContain(
			"This DMS version cannot draw block previews",
		);
		expect(JSON.parse(fallback.find("pre").text())).toEqual(PREVIEW.tree);
	});

	it("switches the rendered tree with the variant tabs", async () => {
		const wrapper = mountCard({ preview: WITH_VARIANTS });
		await openModal(wrapper);
		const tabs = wrapper.findAll("[role=tab]");
		expect(tabs.map((tab) => tab.text())).toEqual(["Proposed", "Compact"]);
		await tabs[1].trigger("click");
		expect(wrapper.find(".bp-pane__stage .dms-block-preview").text()).toBe(
			JSON.stringify(WITH_VARIANTS.variants?.[0].tree),
		);
	});

	it("puts the mockup beside the blocks", async () => {
		const wrapper = mountCard({
			preview: { ...PREVIEW, reference: { caption: "Your Figma frame" } },
			reference: { kind: "image", src: MOCKUP_DATA_URL, name: MOCKUP_NAME },
		});
		await openModal(wrapper);
		expect(wrapper.find(".bp-modal__panes").classes()).toContain("is-split");
		const image = wrapper.find(".bp-pane__image");
		expect(image.attributes("src")).toBe(MOCKUP_DATA_URL);
		expect(image.attributes("alt")).toBe("Your Figma frame");
	});

	it("links an external mockup instead of loading it", async () => {
		const href = "https://figma.example/frame.png";
		const wrapper = mountCard({ reference: { kind: "link", href } });
		await openModal(wrapper);
		expect(wrapper.find(".bp-pane__image").exists()).toBe(false);
		const link = wrapper.find(".bp-pane__link");
		expect(link.attributes("href")).toBe(href);
		expect(link.attributes("rel")).toBe("noopener noreferrer");
	});
});

describe("sketch documents", () => {
	const unset = () => "";

	it("puts the CSP first, before anything the agent wrote", () => {
		const doc = buildSketchDocument(
			{ html: "<p>x</p>", css: "p{}" },
			sketchTokensCss("light", unset),
		);
		const head = doc.slice(doc.indexOf("<head>") + "<head>".length);
		expect(head.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(
			true,
		);
		expect(doc).toContain(
			"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
		);
		expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(
			doc.indexOf("<p>x</p>"),
		);
	});

	it("gives the sketch the dashboard's values, or its defaults", () => {
		const read = (variable: string) =>
			variable === "--ui-border" ? " #123456 " : "";
		const css = sketchTokensCss("dark", read);
		expect(css).toContain("--sketch-scheme:dark;");
		expect(css).toContain("--sketch-border:#123456;");
		expect(css).toContain("--sketch-surface:#10151a;");
	});

	it("never writes a value that could close the style element", () => {
		const read = () => "red}</style><p>";
		const css = sketchTokensCss("light", read);
		expect(css).not.toContain("</style>");
		expect(css).toContain("--sketch-border:#e2e7ea;");
	});
});

describe("a custom sketch in the preview", () => {
	afterEach(() => {
		document.documentElement.classList.remove("dark");
	});

	async function openOnSketchTab(wrapper: VueWrapper): Promise<void> {
		await openModal(wrapper);
		await wrapper.findAll("[role=tab]")[1].trigger("click");
		await nextTick();
	}

	it("tabs a DMS block against a custom sketch", async () => {
		const wrapper = mountCard({ preview: DMS_VS_SKETCH });
		await openModal(wrapper);
		const tabs = wrapper.findAll("[role=tab]");
		expect(tabs.map((tab) => tab.text())).toEqual([
			"DMS KpiCard",
			"Custom sketch",
		]);
		expect(wrapper.find(".bp-pane__stage .dms-block-preview").exists()).toBe(
			true,
		);
		expect(wrapper.find("iframe").exists()).toBe(false);
		await openOnSketchTab(wrapper);
		expect(wrapper.find(".bp-pane__stage").exists()).toBe(false);
		expect(wrapper.find(".bp-pane--sketch").text()).toContain(
			"Custom sketch — not a DMS block",
		);
		expect(wrapper.find(".bp-pane__caption").text()).toBe(SKETCH.caption);
	});

	it("draws the sketch in a sandboxed frame with no script", async () => {
		const wrapper = mountCard({ preview: DMS_VS_SKETCH });
		await openOnSketchTab(wrapper);
		const frame = wrapper.find(".bp-pane--sketch iframe");
		expect(frame.attributes("sandbox")).toBe("");
		expect(frame.attributes("referrerpolicy")).toBe("no-referrer");
		expect(frame.attributes("src")).toBeUndefined();
		expect(frame.attributes("style")).toContain("height: 240px");
		expect(frame.attributes("title")).toContain(SKETCH.caption);
		const doc = frame.attributes("srcdoc") ?? "";
		expect(doc).toContain('http-equiv="Content-Security-Policy"');
		expect(doc).toContain(SKETCH.html);
		expect(doc).toContain(SKETCH.css);
		expect(doc).not.toMatch(/<script/i);
		expect(doc).toContain("--sketch-scheme:light;");
	});

	it("follows the dashboard into dark mode", async () => {
		document.documentElement.classList.add("dark");
		const wrapper = mountCard({ preview: DMS_VS_SKETCH });
		await openOnSketchTab(wrapper);
		const doc = wrapper.find("iframe").attributes("srcdoc") ?? "";
		expect(doc).toContain("--sketch-scheme:dark;");
	});

	it("labels the attachment as holding a custom sketch", () => {
		const wrapper = mountCard({ preview: DMS_VS_SKETCH });
		expect(wrapper.find(".bp-thumb__badge").text()).toBe("Custom sketch");
		expect(wrapper.find(".bp-card__meta").text()).toBe(
			"KpiCard · 1 block · 2 variants · custom sketch",
		);
	});

	it("thumbnails a sketch-only preview with the sandboxed sketch", async () => {
		const wrapper = mountCard({ preview: SKETCH_ONLY });
		await nextTick();
		const frame = wrapper.find(".bp-thumb iframe");
		expect(frame.attributes("sandbox")).toBe("");
		expect(wrapper.find(".bp-card__meta").text()).toBe("custom sketch");
	});

	it("still draws the sketch when the DMS cannot render blocks", async () => {
		const wrapper = mountCard({
			preview: { ...SKETCH_ONLY, tree: { type: "KpiCard" } },
			hasPreviewComponent: false,
		});
		await openModal(wrapper);
		await nextTick();
		expect(wrapper.find(".bp-fallback").exists()).toBe(true);
		expect(wrapper.find(".bp-pane--sketch iframe").exists()).toBe(true);
		expect(wrapper.find(".bp-modal__panes").classes()).toContain("is-split");
	});

	it("keeps a sketch-only preview as a single tab", () => {
		const restored = previewTabs(SKETCH_ONLY);
		expect(restored).toHaveLength(1);
		expect(restored[0].sketch).toEqual(SKETCH);
		expect(restored[0].tree).toBeUndefined();
	});
});
