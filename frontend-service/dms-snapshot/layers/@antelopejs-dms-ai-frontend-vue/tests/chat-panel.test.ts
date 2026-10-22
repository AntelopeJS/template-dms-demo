// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ChatPanel from "../app/components/ChatPanel.vue";
import {
	CONVERSATION_ID,
	createHarness,
	deliver,
	openPanel,
	sendMessage,
	sentOfType,
	unmountPanel,
	providedSession,
} from "./support/panel-harness";
import { PANEL_STUBS } from "./support/stubs";

const STALL_AFTER_MS = 20_000;

beforeEach(() => {
	localStorage.setItem("dms-ai-conversation-id", CONVERSATION_ID);
});

afterEach(() => {
	unmountPanel();
	localStorage.clear();
	vi.useRealTimers();
});

describe("the chat as a component of the dashboard", () => {
	it("renders in the dashboard document itself: no iframe, no second document", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		expect(document.querySelector("iframe")).toBeNull();
		expect(panel.find("[data-dms-side-panel] .dms-ai-panel").exists()).toBe(
			true,
		);
		expect(panel.find(".chat-view").exists()).toBe(true);
		expect(Reflect.has(globalThis, "dmsAiChatTransport")).toBe(false);
	});

	it("says hello with its conversation on the shared stream when it opens", async () => {
		const harness = createHarness();
		await openPanel(harness);
		expect(sentOfType(harness, "hello")).toEqual([
			{ type: "hello", role: "chat", conversationId: CONVERSATION_ID },
		]);
	});

	it("leaves its conversation when the panel closes, and picks it up again when it opens", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "build me a page");
		harness.session.panel.close();
		await nextTick();
		expect(panel.find(".chat-view").exists()).toBe(false);
		expect(sentOfType(harness, "leave_conversation")).toEqual([
			{ type: "leave_conversation", conversationId: CONVERSATION_ID },
		]);
		harness.session.panel.toggle();
		await flushPromises();
		expect(sentOfType(harness, "hello")).toEqual([
			{ type: "hello", role: "chat", conversationId: CONVERSATION_ID },
			{ type: "hello", role: "chat", conversationId: CONVERSATION_ID },
		]);
		deliver(harness, {
			type: "conversation_snapshot",
			messages: [{ role: "user", content: "build me a page", timestampMs: 1 }],
		});
		await nextTick();
		expect(panel.text()).toContain("build me a page");
	});

	it("opens the settings page through the dashboard router, not the sidecar", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		const settings = panel
			.findAll(".u-dropdown-item")
			.find((item) => item.text() === "Settings");
		await settings?.trigger("click");
		expect(harness.navigate).toHaveBeenCalledExactlyOnceWith(
			"/modules/ai/settings",
		);
		expect(sentOfType(harness, "request_host_navigate")).toEqual([]);
	});

	it("asks for the conversation list again once a stream that was down connects", async () => {
		const harness = createHarness();
		harness.setChannelStatus("connecting");
		await openPanel(harness);
		expect(sentOfType(harness, "list_conversations")).toEqual([]);
		harness.setChannelStatus("connected");
		await nextTick();
		expect(sentOfType(harness, "list_conversations")).toHaveLength(1);
	});

	it("closes from its own button, and stays open on a click elsewhere: docked, it is part of the page", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		document.body.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, composed: true }),
		);
		expect(harness.session.panel.isOpen.value).toBe(true);
		await panel.find('button[aria-label="Close"]').trigger("click");
		expect(harness.session.panel.isOpen.value).toBe(false);
	});

	it("shows the first connection while the session is not there yet", async () => {
		const panel = mount(ChatPanel, {
			global: { provide: providedSession(null), stubs: PANEL_STUBS },
		});
		await nextTick();
		expect(panel.find(".dms-ai-panel-status").text()).toContain(
			"Connecting the assistant",
		);
		expect(panel.find(".chat-view").exists()).toBe(false);
		panel.unmount();
	});

	it("keeps the transcript under a banner while the sidecar revives, and offers a restart once it gave up", async () => {
		const harness = createHarness();
		harness.lastError.value = "EADDRINUSE: port 5010 is already in use";
		const panel = await openPanel(harness);
		harness.sidecarStatus.value = "reviving";
		await nextTick();
		expect(panel.find(".dms-ai-panel-status").exists()).toBe(false);
		expect(panel.find(".connection-banner").text()).toContain("restarting");
		harness.sidecarStatus.value = "unavailable";
		await nextTick();
		const screen = panel.find(".dms-ai-panel-status");
		expect(screen.text()).toContain("The assistant isn't running");
		expect(screen.text()).toContain("EADDRINUSE");
		const restart = screen
			.findAll("button")
			.find((button) => button.text() === "Restart assistant");
		await restart?.trigger("click");
		expect(harness.restart).toHaveBeenCalledOnce();
		await screen.find('button[aria-label="Close"]').trigger("click");
		expect(harness.session.panel.isOpen.value).toBe(false);
		harness.sidecarStatus.value = "connected";
		await nextTick();
		expect(panel.find(".dms-ai-panel-status").exists()).toBe(false);
	});

	it("renders the answer as markup, with nothing the model wrote running in the dashboard", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "go");
		deliver(harness, {
			type: "assistant_message_chunk",
			text: '**Done** <img src=x onerror="window.pwned=1"> [x](javascript:alert(1))',
		});
		await vi.advanceTimersByTimeAsync(100);
		deliver(harness, { type: "run_done" });
		await nextTick();
		const answer = panel.find(".chat-markdown");
		expect(answer.find("strong").text()).toBe("Done");
		expect(answer.find("img").exists()).toBe(false);
		expect(answer.find("a").exists()).toBe(false);
		expect(Reflect.get(globalThis, "pwned")).toBeUndefined();
	});
});

describe("a running turn shows what it is doing, and never spins forever", () => {
	it("shows the activity the sidecar reports, with the elapsed time", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "reproduce this page");
		deliver(harness, {
			type: "run_progress",
			activity: "writing",
			detail: "Write",
			elapsedMs: 72_000,
			idleMs: 0,
		});
		await nextTick();
		expect(panel.find(".thinking").text()).toContain("Preparing · Write file…");
		expect(panel.find(".thinking-clock").text()).toBe("1:12");
	});

	it("says so after 20 s without news about the turn, and reconnects or stops from there", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "reproduce this page");
		await vi.advanceTimersByTimeAsync(STALL_AFTER_MS + 1_000);
		const notice = panel.find(".run-stalled");
		expect(notice.text()).toContain("No news from the assistant for 0:2");
		const [reconnect, stop] = notice.findAll("button");
		await reconnect?.trigger("click");
		expect(harness.reconnects).toBe(1);
		await stop?.trigger("click");
		expect(sentOfType(harness, "interrupt_turn")).toHaveLength(1);
	});

	it("stays quiet while the sidecar keeps reporting a long step", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "reproduce this page");
		for (let beat = 0; beat < 8; beat += 1) {
			await vi.advanceTimersByTimeAsync(5_000);
			deliver(harness, {
				type: "run_progress",
				activity: "tool",
				detail: "Write",
				elapsedMs: (beat + 1) * 5_000,
				idleMs: 0,
			});
		}
		await nextTick();
		expect(panel.find(".run-stalled").exists()).toBe(false);
		expect(panel.find(".thinking").exists()).toBe(true);
	});

	it("shows a run error with Retry turn, which asks the sidecar to run it again", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "reproduce this page");
		deliver(harness, { type: "run_error", error: "API Error: 529 overloaded" });
		await nextTick();
		const error = panel.find(".message-bubble-error");
		expect(error.text()).toContain("API Error: 529 overloaded");
		const retry = error
			.findAll("button")
			.find((button) => button.text() === "Retry turn");
		await retry?.trigger("click");
		expect(sentOfType(harness, "retry_turn")).toHaveLength(1);
	});

	it("offers no Retry for a run error that sending again cannot fix", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await sendMessage(panel, "reproduce this page");
		deliver(harness, {
			type: "run_error",
			error: "Prompt is too long",
			isRetryable: false,
		});
		await nextTick();
		const error = panel.find(".message-bubble-error");
		expect(error.text()).toContain("Prompt is too long");
		expect(error.text()).not.toContain("Retry turn");
	});

	it("says a message was not sent when the stream dropped as it left", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		await panel.find("textarea").setValue("reproduce this page");
		harness.setChannelStatus("reconnecting");
		await panel.find("form.composer").trigger("submit");
		expect(panel.find(".message-bubble-error").text()).toContain(
			"Your message was not sent",
		);
		expect(sentOfType(harness, "user_message")).toEqual([]);
	});

	it("shows the error a run left in the stored transcript after a reload", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		deliver(harness, {
			type: "conversation_snapshot",
			messages: [
				{ role: "user", content: "go", timestampMs: 1 },
				{ role: "error", content: "The run was stopped.", timestampMs: 2 },
			],
		});
		await nextTick();
		expect(panel.find(".message-bubble-error").text()).toContain(
			"The run was stopped.",
		);
	});
});

describe("the shared stream going away and coming back", () => {
	it("says reconnecting and holds the input, then says hello again and picks the transcript up, as after a dms-ai hot reload", async () => {
		const harness = createHarness();
		const panel = await openPanel(harness);
		harness.setChannelStatus("reconnecting");
		await nextTick();
		expect(panel.find(".connection-banner").text()).toContain(
			"Connection lost",
		);
		expect(panel.find("textarea").attributes("disabled")).toBeDefined();
		harness.setChannelStatus("connected");
		harness.hub.announceReady();
		deliver(harness, {
			type: "conversation_snapshot",
			messages: [
				{ role: "user", content: "before the reload", timestampMs: 1 },
			],
		});
		deliver(harness, { type: "run_resumed" });
		await nextTick();
		expect(sentOfType(harness, "hello")).toHaveLength(2);
		expect(panel.find(".connection-banner").exists()).toBe(false);
		expect(panel.find("textarea").attributes("disabled")).toBeUndefined();
		expect(panel.text()).toContain("before the reload");
		expect(panel.find(".thinking").exists()).toBe(true);
	});
});
