import { afterEach, describe, expect, it } from "vitest";
import {
	type ChatChannel,
	createChatChannel,
} from "../../app/chat/composables/useChatChannel";
import {
	CHAT_ROLE,
	CLIENT_MESSAGE_TYPES,
	CONNECTION_STATUSES,
	SERVER_EVENT_TYPES,
} from "../../app/chat/constants/protocol";
import type { ChannelStatus } from "../../app/runtime/channel-client";
import { createChatTransport } from "../../app/runtime/chat-transport";

const CONVERSATION_ID = "conv-channel-1";

const HELLO = {
	type: CLIENT_MESSAGE_TYPES.HELLO,
	role: CHAT_ROLE,
	conversationId: CONVERSATION_ID,
};

interface FakeStream {
	sent: unknown[];
	reconnects: number;
	status: ChannelStatus;
	hub: ReturnType<typeof createChatTransport>;
}

/** The dashboard's side: a stream whose status the test drives. */
function fakeStream(status: ChannelStatus): FakeStream {
	const stream: FakeStream = {
		sent: [],
		reconnects: 0,
		status,
		hub: createChatTransport({
			send: (msg) => {
				if (stream.status !== CONNECTION_STATUSES.CONNECTED) return false;
				stream.sent.push(msg);
				return true;
			},
			reconnect: () => {
				stream.reconnects += 1;
			},
			getStatus: () => stream.status,
		}),
	};
	return stream;
}

let channel: ChatChannel | undefined;

function open(stream: FakeStream): ChatChannel {
	channel = createChatChannel({
		transport: stream.hub.transport,
		getConversationId: () => CONVERSATION_ID,
	});
	channel.start();
	return channel;
}

afterEach(() => {
	channel?.stop();
	channel = undefined;
});

describe("the chat's side of the dashboard's stream", () => {
	it("hands the chat every message meant for it, a running turn's progress included", () => {
		const stream = fakeStream(CONNECTION_STATUSES.CONNECTED);
		const received: unknown[] = [];
		open(stream).result.onMessage((msg) => received.push(msg));
		const progress = {
			type: SERVER_EVENT_TYPES.RUN_PROGRESS,
			conversationId: CONVERSATION_ID,
			activity: "tool",
			detail: "Write",
			elapsedMs: 5_000,
			idleMs: 0,
		};
		stream.hub.deliver(progress);
		expect(received).toEqual([progress]);
	});

	it("says hello with its conversation when it attaches and on every new connection", () => {
		const stream = fakeStream(CONNECTION_STATUSES.CONNECTED);
		open(stream);
		stream.hub.announceReady();
		expect(stream.sent).toEqual([HELLO, HELLO]);
	});

	it("tells the chat a message did not leave while the stream is down", () => {
		const stream = fakeStream(CONNECTION_STATUSES.RECONNECTING);
		const { result } = open(stream);
		expect(result.isConnected.value).toBe(false);
		expect(result.send({ type: CLIENT_MESSAGE_TYPES.INTERRUPT_TURN })).toBe(
			false,
		);
		stream.status = CONNECTION_STATUSES.CONNECTED;
		stream.hub.announceStatus(CONNECTION_STATUSES.CONNECTED);
		expect(result.isConnected.value).toBe(true);
		expect(result.send({ type: CLIENT_MESSAGE_TYPES.INTERRUPT_TURN })).toBe(
			true,
		);
	});

	it("reconnects the dashboard's stream when the chat asks, as the stalled-run notice does", () => {
		const stream = fakeStream(CONNECTION_STATUSES.CONNECTED);
		open(stream).result.reconnect();
		expect(stream.reconnects).toBe(1);
	});

	it("hands nothing over and sends nothing once stopped", () => {
		const stream = fakeStream(CONNECTION_STATUSES.CONNECTED);
		const received: unknown[] = [];
		const opened = open(stream);
		opened.result.onMessage((msg) => received.push(msg));
		opened.stop();
		stream.hub.deliver({ type: SERVER_EVENT_TYPES.RUN_DONE });
		expect(received).toEqual([]);
		expect(opened.result.send({ type: CLIENT_MESSAGE_TYPES.HELLO })).toBe(
			false,
		);
	});
});
