export interface StreamEvent {
	name: string;
	data: string;
}

const DEFAULT_EVENT_NAME = "message";
const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;
const FIELD_SEPARATOR = ":";
const EVENT_FIELD = "event";
const DATA_FIELD = "data";

interface Field {
	name: string;
	value: string;
}

function parseField(line: string): Field {
	const boundary = line.indexOf(FIELD_SEPARATOR);
	if (boundary === -1) return { name: line, value: "" };
	const raw = line.slice(boundary + FIELD_SEPARATOR.length);
	return {
		name: line.slice(0, boundary),
		value: raw.startsWith(" ") ? raw.slice(1) : raw,
	};
}

function parseFrame(frame: string): StreamEvent | null {
	let name = DEFAULT_EVENT_NAME;
	const data: string[] = [];
	for (const line of frame.split(LINE_SEPARATOR)) {
		const field = parseField(line);
		if (field.name === EVENT_FIELD) name = field.value;
		if (field.name === DATA_FIELD) data.push(field.value);
	}
	if (data.length === 0) return null;
	return { name, data: data.join("\n") };
}

function dispatchFrames(
	buffer: string,
	onEvent: (event: StreamEvent) => void,
): string {
	const frames = buffer.split(FRAME_SEPARATOR);
	const rest = frames.pop() ?? "";
	for (const frame of frames) {
		const event = parseFrame(frame);
		if (event !== null) onEvent(event);
	}
	return rest;
}

/**
 * Delivers every event of a text/event-stream body until it ends. Read over
 * fetch rather than EventSource, like the DMS realtime stream, so a failed
 * request surfaces its status and nothing reconnects behind the caller's back.
 */
export async function readEventStream(
	body: ReadableStream<Uint8Array>,
	onEvent: (event: StreamEvent) => void,
): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) return;
			buffer += decoder.decode(chunk.value, { stream: true });
			buffer = dispatchFrames(buffer, onEvent);
		}
	} finally {
		reader.releaseLock();
	}
}
