import { describe, expect, it, vi } from "vitest";
import { createChatTransport } from "../app/runtime/chat-transport";
import { createFrameRouter } from "../app/runtime/frame-router";

function hub() {
	const actions = {
		send: vi.fn(() => true),
		reconnect: vi.fn(),
		getStatus: vi.fn(() => "connected" as const),
	};
	return { actions, chat: createChatTransport(actions) };
}

describe("chat transport", () => {
	it("gives the chat its messages, readiness and status, and sends through the stream", () => {
		const { actions, chat } = hub();
		const messages: object[] = [];
		const statuses: string[] = [];
		const ready = vi.fn();
		chat.transport.onMessage((msg) => messages.push(msg));
		chat.transport.onStatus((status) => statuses.push(status));
		chat.transport.onReady(ready);
		chat.deliver({ type: "run_done" });
		chat.announceStatus("reconnecting");
		chat.announceReady();
		expect(chat.transport.send({ type: "hello" })).toBe(true);
		chat.transport.reconnect();
		expect(messages).toEqual([{ type: "run_done" }]);
		expect(statuses).toEqual(["reconnecting"]);
		expect(ready).toHaveBeenCalledTimes(1);
		expect(actions.send).toHaveBeenCalledWith({ type: "hello" });
		expect(actions.reconnect).toHaveBeenCalledTimes(1);
		expect(chat.transport.getStatus()).toBe("connected");
	});

	it("stops delivering to a listener once it unsubscribed", () => {
		const { chat } = hub();
		const messages: object[] = [];
		const unsubscribe = chat.transport.onMessage((msg) => messages.push(msg));
		unsubscribe();
		chat.deliver({});
		expect(messages).toEqual([]);
	});

	it("keeps delivering when one listener throws", () => {
		const { chat } = hub();
		const messages: object[] = [];
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		chat.transport.onMessage(() => {
			throw new Error("broken listener");
		});
		chat.transport.onMessage((msg) => messages.push(msg));
		chat.deliver({ type: "run_done" });
		expect(messages).toEqual([{ type: "run_done" }]);
		error.mockRestore();
	});

	it("publishes nothing on the window: no other document borrows it any more", () => {
		hub();
		expect(Reflect.has(globalThis, "dmsAiChatTransport")).toBe(false);
	});
});

describe("frame routing on the tab's one stream", () => {
	it("hands host commands to the dashboard and everything else to the chat, parsed once", () => {
		const host = vi.fn();
		const chat = vi.fn();
		const route = createFrameRouter({ host, chat });
		route('{"type":"host_command_navigate","path":"/x"}');
		route(
			'{"type":"assistant_message_chunk","conversationId":"c","text":"hi"}',
		);
		route('{"type":"settings_update","settings":{}}');
		expect(host.mock.calls).toEqual([
			[{ type: "host_command_navigate", path: "/x" }],
		]);
		expect(chat.mock.calls.map(([msg]) => msg.type)).toEqual([
			"assistant_message_chunk",
			"settings_update",
		]);
	});

	it("drops what is not a typed message", () => {
		const host = vi.fn();
		const chat = vi.fn();
		const route = createFrameRouter({ host, chat });
		for (const raw of ["not json", "42", "null", '{"type":7}', "[]"])
			route(raw);
		expect(host).not.toHaveBeenCalled();
		expect(chat).not.toHaveBeenCalled();
	});
});
