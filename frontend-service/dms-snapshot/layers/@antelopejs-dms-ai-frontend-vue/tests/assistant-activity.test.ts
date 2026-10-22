import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import {
	type AssistantStatusPayload,
	createAssistantActivity,
} from "../app/runtime/assistant-activity";
import type { ChatTransport } from "../app/runtime/chat-transport";

type Listener = (msg: object) => void;

function fakeChat() {
	const listeners = new Set<Listener>();
	const chat = {
		onMessage: (listener: Listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	} as unknown as ChatTransport;
	return { chat, emit: (msg: object) => listeners.forEach((l) => l(msg)) };
}

describe("assistant activity", () => {
	it("polls the status through the read's interval while it is useful, and stops on teardown", async () => {
		const data = ref<AssistantStatusPayload | null>(null);
		let interval: () => number = () => -1;
		const isPanelOpen = ref(false);
		const { chat } = fakeChat();
		const activity = createAssistantActivity({
			readStatus: (given) => {
				interval = given;
				return { data, refresh: async () => undefined };
			},
			chat,
			shouldPoll: () => !isPanelOpen.value,
		});
		expect(interval()).toBe(15_000);
		isPanelOpen.value = true;
		expect(interval()).toBe(0);
		isPanelOpen.value = false;
		activity.stop();
		expect(interval()).toBe(0);
	});

	it("takes its counts from each status answer and from the stream's lists", async () => {
		const data = ref<AssistantStatusPayload | null>(null);
		const { chat, emit } = fakeChat();
		const activity = createAssistantActivity({
			readStatus: () => ({ data, refresh: async () => undefined }),
			chat,
			shouldPoll: () => true,
		});
		data.value = { pendingApprovals: 2, workingConversations: 0 };
		await nextTick();
		expect(activity.pendingApprovals.value).toBe(2);
		expect(activity.isBusy.value).toBe(true);
		emit({ type: "conversation_list", conversations: [{ isRunning: true }] });
		expect(activity.pendingApprovals.value).toBe(0);
		expect(activity.workingConversations.value).toBe(1);
		data.value = {
			pendingApprovals: 0,
			workingConversations: 0,
			lastError: "boom",
		};
		await nextTick();
		expect(activity.workingConversations.value).toBe(0);
		expect(activity.lastError.value).toBe("boom");
		activity.stop();
	});
});
