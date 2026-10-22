import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type ChannelStatus,
	createChannelClient,
} from "../app/runtime/channel-client";
import { CHANNEL_RECONNECT_DELAYS_MS } from "../app/runtime/constants";

interface FakeStream {
	path: string;
	emit: (name: string, data: string) => void;
	end: () => void;
}

interface Harness {
	streams: FakeStream[];
	posts: Array<{ path: string; body: unknown }>;
	statuses: ChannelStatus[];
	ready: ReturnType<typeof vi.fn>;
	frames: string[];
}

const encoder = new TextEncoder();
const READY = '{"connectionId":"c 1"}';

function openFakeStream(
	streams: FakeStream[],
	path: string,
	signal: AbortSignal,
): Promise<Response> {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({
		start: (c) => {
			controller = c;
		},
	});
	signal.addEventListener("abort", () =>
		controller.error(new DOMException("aborted", "AbortError")),
	);
	streams.push({
		path,
		emit: (name, data) =>
			controller.enqueue(encoder.encode(`event: ${name}\ndata: ${data}\n\n`)),
		end: () => controller.close(),
	});
	return Promise.resolve(new Response(body, { status: 200 }));
}

function startClient(post = vi.fn(async () => undefined)) {
	const harness: Harness = {
		streams: [],
		posts: [],
		statuses: [],
		ready: vi.fn(),
		frames: [],
	};
	const client = createChannelClient({
		post: async (path, body) => {
			harness.posts.push({ path, body });
			return post(path, body);
		},
		openStream: (path, signal) => openFakeStream(harness.streams, path, signal),
		onReady: harness.ready,
		onFrame: (raw) => harness.frames.push(raw),
		onStatusChange: (status) => harness.statuses.push(status),
	});
	client.start();
	return { client, harness };
}

async function flush(): Promise<void> {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
	vi.useRealTimers();
});

describe("channel client", () => {
	it("stays closed until started", async () => {
		const streams: FakeStream[] = [];
		const client = createChannelClient({
			post: vi.fn(),
			openStream: (path, signal) => openFakeStream(streams, path, signal),
		});
		await flush();
		expect(streams).toEqual([]);
		expect(client.getStatus()).toBe("disconnected");
	});

	it("opens one stream for the dashboard and its chat, on the dashboard origin, with no credential", async () => {
		const { client, harness } = startClient();
		await flush();
		expect(harness.streams.map((stream) => stream.path)).toEqual([
			"/ai/channel/events",
		]);
		client.stop();
	});

	it("announces the connection, then hands over every frame raw, whoever it is for", async () => {
		const { client, harness } = startClient();
		await flush();
		harness.streams[0]?.emit("ready", READY);
		harness.streams[0]?.emit(
			"message",
			'{"type":"host_command_navigate","path":"/x"}',
		);
		harness.streams[0]?.emit("message", '{"type":"run_done"}');
		harness.streams[0]?.emit("unknown", "{}");
		await flush();
		expect(harness.ready).toHaveBeenCalledTimes(1);
		expect(client.isConnected()).toBe(true);
		expect(harness.frames).toEqual([
			'{"type":"host_command_navigate","path":"/x"}',
			'{"type":"run_done"}',
		]);
		client.stop();
	});

	it("posts one message at a time, in order, to the connection", async () => {
		const pending: Array<() => void> = [];
		const post = vi.fn(
			() => new Promise<void>((resolve) => pending.push(() => resolve())),
		);
		const { client, harness } = startClient(post);
		await flush();
		harness.streams[0]?.emit("ready", READY);
		await flush();
		client.send({ n: 1 });
		client.send({ n: 2 });
		await flush();
		expect(harness.posts).toEqual([
			{ path: "/ai/channel/c%201/messages", body: { n: 1 } },
		]);
		pending.shift()?.();
		await flush();
		expect(harness.posts.at(-1)).toEqual({
			path: "/ai/channel/c%201/messages",
			body: { n: 2 },
		});
		client.stop();
	});

	it("drops a message sent before the connection is ready, and says so", async () => {
		const { client, harness } = startClient();
		expect(client.send({ n: 1 })).toBe(false);
		await flush();
		expect(harness.posts).toEqual([]);
		harness.streams[0]?.emit("ready", READY);
		await flush();
		expect(client.send({ n: 2 })).toBe(true);
		client.stop();
	});

	it("reconnects with backoff when the stream ends, and announces the new connection", async () => {
		vi.useFakeTimers();
		const { client, harness } = startClient();
		await vi.advanceTimersByTimeAsync(0);
		harness.streams[0]?.emit("ready", READY);
		await vi.advanceTimersByTimeAsync(0);
		harness.streams[0]?.end();
		await vi.advanceTimersByTimeAsync(0);
		expect(client.isConnected()).toBe(false);
		expect(harness.statuses).toEqual([
			"connecting",
			"connected",
			"reconnecting",
		]);
		await vi.advanceTimersByTimeAsync(CHANNEL_RECONNECT_DELAYS_MS[0]);
		harness.streams[1]?.emit("ready", READY);
		await vi.advanceTimersByTimeAsync(0);
		expect(harness.streams).toHaveLength(2);
		expect(harness.ready).toHaveBeenCalledTimes(2);
		expect(harness.statuses.at(-1)).toBe("connected");
		client.stop();
	});

	it("drops the connection and reconnects when a post fails", async () => {
		vi.useFakeTimers();
		const post = vi.fn(async () => {
			throw new Error("404");
		});
		const { client, harness } = startClient(post);
		await vi.advanceTimersByTimeAsync(0);
		harness.streams[0]?.emit("ready", READY);
		await vi.advanceTimersByTimeAsync(0);
		client.send({ n: 1 });
		await vi.advanceTimersByTimeAsync(0);
		expect(client.getStatus()).toBe("reconnecting");
		await vi.advanceTimersByTimeAsync(CHANNEL_RECONNECT_DELAYS_MS[0]);
		expect(harness.streams).toHaveLength(2);
		client.stop();
	});

	it("says connecting while reconnectNow replaces a live stream, until the new one is ready", async () => {
		const { client, harness } = startClient();
		await flush();
		harness.streams[0]?.emit("ready", READY);
		await flush();
		client.reconnectNow();
		await flush();
		expect(client.getStatus()).toBe("connecting");
		expect(client.send({ n: 1 })).toBe(false);
		harness.streams[1]?.emit("ready", READY);
		await flush();
		expect(harness.statuses).toEqual([
			"connecting",
			"connected",
			"connecting",
			"connected",
		]);
		expect(harness.ready).toHaveBeenCalledTimes(2);
		client.stop();
	});

	it("skips the backoff on reconnectNow", async () => {
		vi.useFakeTimers();
		const { client, harness } = startClient();
		await vi.advanceTimersByTimeAsync(0);
		harness.streams[0]?.end();
		await vi.advanceTimersByTimeAsync(0);
		client.reconnectNow();
		await vi.advanceTimersByTimeAsync(0);
		expect(harness.streams).toHaveLength(2);
		client.stop();
	});

	it("stops reconnecting once stopped, and opens again on start", async () => {
		vi.useFakeTimers();
		const { client, harness } = startClient();
		await vi.advanceTimersByTimeAsync(0);
		client.stop();
		await vi.advanceTimersByTimeAsync(
			CHANNEL_RECONNECT_DELAYS_MS[CHANNEL_RECONNECT_DELAYS_MS.length - 1] * 2,
		);
		expect(harness.streams).toHaveLength(1);
		expect(client.getStatus()).toBe("disconnected");
		client.reconnectNow();
		await vi.advanceTimersByTimeAsync(0);
		expect(harness.streams).toHaveLength(1);
		client.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(harness.streams).toHaveLength(2);
		client.stop();
	});
});
