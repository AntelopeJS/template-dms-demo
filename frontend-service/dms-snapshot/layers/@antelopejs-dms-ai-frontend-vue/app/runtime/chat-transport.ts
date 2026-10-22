import type { ChannelStatus } from "./channel-client";
import { createListeners } from "./listeners";

/**
 * The chat's side of the tab's stream: the dashboard owns the stream and hands
 * the chat the sidecar messages that are not host commands.
 */
export interface ChatTransport {
	/** Sidecar messages for the chat, parsed once by the dashboard, in order. */
	onMessage: (listener: (msg: object) => void) => () => void;
	/** Every (re)connection is a new sidecar socket: the chat says hello again. */
	onReady: (listener: () => void) => () => void;
	onStatus: (listener: (status: ChannelStatus) => void) => () => void;
	getStatus: () => ChannelStatus;
	/** False when the message was dropped because the stream is not connected. */
	send: (msg: unknown) => boolean;
	reconnect: () => void;
}

export interface ChatTransportActions {
	send: (msg: unknown) => boolean;
	reconnect: () => void;
	getStatus: () => ChannelStatus;
}

export interface ChatTransportHub {
	transport: ChatTransport;
	deliver: (msg: object) => void;
	announceReady: () => void;
	announceStatus: (status: ChannelStatus) => void;
}

export function createChatTransport(
	actions: ChatTransportActions,
): ChatTransportHub {
	const messages = createListeners<object>();
	const ready = createListeners<undefined>();
	const statuses = createListeners<ChannelStatus>();
	return {
		transport: {
			onMessage: messages.add,
			onReady: (listener) => ready.add(() => listener()),
			onStatus: statuses.add,
			getStatus: actions.getStatus,
			send: actions.send,
			reconnect: actions.reconnect,
		},
		deliver: messages.emit,
		announceReady: () => ready.emit(undefined),
		announceStatus: statuses.emit,
	};
}
