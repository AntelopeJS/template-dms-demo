// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import PaletteAnswer from "../app/components/PaletteAnswer.vue";
import type { CurrentPage } from "../app/chat/types/conversation";
import {
	assistantSidePanel,
	launcherAction,
	paletteAssistant,
} from "../app/runtime/assistant-commands";
import {
	createHarness,
	type Harness,
	providedSession,
	sentOfType,
} from "./support/panel-harness";
import { createTestI18n } from "./support/i18n";
import { PANEL_STUBS } from "./support/stubs";

const PROMPT = "What does this page show?";

let answer: VueWrapper | null = null;

afterEach(() => {
	answer?.unmount();
	answer = null;
	localStorage.clear();
});

function askFromPalette(harness: Harness, close = vi.fn()): VueWrapper {
	answer = mount(PaletteAnswer, {
		props: { prompt: PROMPT, close },
		global: { provide: providedSession(harness.session), stubs: PANEL_STUBS },
	});
	return answer;
}

function paletteConversation(harness: Harness): string {
	const hello = sentOfType(harness, "hello")[0];
	return String(hello?.conversationId);
}

function deliverToPalette(
	harness: Harness,
	event: Record<string, unknown>,
): void {
	harness.hub.deliver({
		conversationId: paletteConversation(harness),
		...event,
	});
}

describe("the assistant's registrations in the dashboard", () => {
	it("docks the panel by id, and lets the DMS toggle it from the launcher", () => {
		const { t } = createTestI18n();
		const panel = assistantSidePanel();
		expect(panel).toMatchObject({
			id: "dms-ai:assistant",
			component: "DmsAiChatPanel",
			ariaLabel: "$dms_ai.panel.launcher",
		});
		expect(panel.minWidth).toBeLessThan(panel.defaultWidth);
		expect(panel.defaultWidth).toBeLessThan(panel.maxWidth);
		const launcher = launcherAction(t);
		expect(launcher.sidePanelId).toBe(panel.id);
		expect(launcher).not.toHaveProperty("onSelect");
		expect(launcher).not.toHaveProperty("isActive");
	});

	it("offers the palette prompts that fit the page on screen", () => {
		const { t } = createTestI18n();
		const page = ref<CurrentPage | null>({
			path: "/sales/overview",
			title: "Sales overview · DMS",
		});
		const assistant = paletteAssistant(t, page);
		expect(assistant).toMatchObject({
			id: "dms-ai:assistant",
			answerComponent: "DmsAiPaletteAnswer",
			label: "$dms_ai.panel.palette.assistant",
			placeholder: "$dms_ai.panel.palette.placeholder",
		});
		expect(assistant.suggestions().map((item) => item.label)).toEqual([
			"Explain what Sales overview shows",
			"Add a chart to Sales overview",
			"Add a filter to the table on Sales overview",
		]);
		page.value = { path: "/home", title: "Home" };
		expect(assistant.suggestions().map((item) => item.label)).toContain(
			"Explain how this project is organised",
		);
	});
});

describe("an answer in the command palette", () => {
	it("asks read-only, in a conversation of its own it follows next to the panel's", async () => {
		const harness = createHarness();
		askFromPalette(harness);
		await flushPromises();
		const conversationId = paletteConversation(harness);
		expect(sentOfType(harness, "hello")).toEqual([
			{ type: "hello", role: "chat", conversationId, follow: true },
		]);
		expect(sentOfType(harness, "set_conversation_mode")).toEqual([
			{
				type: "set_conversation_mode",
				conversationId,
				mode: "plan",
				generationMode: "safe",
			},
		]);
		expect(sentOfType(harness, "user_message")).toMatchObject([
			{ conversationId, content: PROMPT },
		]);
		expect(harness.streamHolds).toBe(1);
	});

	it("waits for the stream before it asks", async () => {
		const harness = createHarness();
		harness.setChannelStatus("connecting");
		askFromPalette(harness);
		await flushPromises();
		expect(sentOfType(harness, "user_message")).toEqual([]);
		harness.setChannelStatus("connected");
		harness.hub.announceReady();
		await flushPromises();
		expect(sentOfType(harness, "user_message")).toHaveLength(1);
		expect(sentOfType(harness, "hello")[0]).toMatchObject({ follow: true });
	});

	it("streams the answer, and ignores the panel's conversation", async () => {
		const harness = createHarness();
		const view = askFromPalette(harness);
		await flushPromises();
		harness.hub.deliver({
			conversationId: "conv-of-the-panel",
			type: "assistant_message_chunk",
			text: "not for the palette",
		});
		deliverToPalette(harness, {
			type: "assistant_message_chunk",
			text: "It lists the **sales** of the quarter.",
		});
		deliverToPalette(harness, { type: "run_done" });
		await flushPromises();
		expect(view.text()).toContain("It lists the sales of the quarter.");
		expect(view.text()).not.toContain("not for the palette");
		expect(view.text()).not.toContain(PROMPT);
	});

	it("continues in the assistant: the panel opens on that conversation and the turn keeps running", async () => {
		const harness = createHarness();
		const close = vi.fn();
		const view = askFromPalette(harness, close);
		await flushPromises();
		const conversationId = paletteConversation(harness);
		const button = view
			.findAll("button")
			.find((item) => item.text() === "Continue in the assistant");
		await button?.trigger("click");
		expect(close).toHaveBeenCalledOnce();
		expect(harness.session.panel.isOpen.value).toBe(true);
		expect(harness.session.intents.pending.value).toEqual({
			kind: "open",
			conversationId,
		});
		view.unmount();
		answer = null;
		expect(sentOfType(harness, "interrupt_turn")).toEqual([]);
		expect(harness.streamHolds).toBe(0);
	});

	it("stops its turn when the palette closes on it, and lets the stream go", async () => {
		const harness = createHarness();
		const view = askFromPalette(harness);
		await flushPromises();
		const conversationId = paletteConversation(harness);
		view.unmount();
		answer = null;
		expect(sentOfType(harness, "interrupt_turn")).toEqual([
			{ type: "interrupt_turn", conversationId },
		]);
		expect(harness.streamHolds).toBe(0);
	});

	it("says when the agent waits for the user, who answers in the assistant", async () => {
		const harness = createHarness();
		const view = askFromPalette(harness);
		await flushPromises();
		deliverToPalette(harness, {
			type: "ask_question",
			requestId: "q1",
			questions: [
				{
					header: "Scope",
					question: "Which table?",
					options: [{ label: "Orders" }, { label: "Customers" }],
					multiSelect: false,
				},
			],
			createdAtMs: Date.now(),
			expiresAtMs: Date.now() + 60_000,
		});
		await nextTick();
		expect(view.find('[role="alert"]').text()).toContain(
			"The assistant is waiting for you",
		);
	});

	it("says the assistant does not run in this tab without a session", () => {
		answer = mount(PaletteAnswer, {
			props: { prompt: PROMPT, close: vi.fn() },
			global: { provide: providedSession(null), stubs: PANEL_STUBS },
		});
		expect(answer.text()).toContain("isn't running in this tab");
		expect(answer.findAll("button").map((button) => button.text())).toEqual([
			"Close",
		]);
	});
});
