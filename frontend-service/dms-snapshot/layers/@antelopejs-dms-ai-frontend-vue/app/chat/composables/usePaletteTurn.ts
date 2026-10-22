import { computed, type ComputedRef, ref } from "vue";
import type { ChatTransport } from "../../runtime/chat-transport";
import {
	CLIENT_MESSAGE_TYPES,
	CONNECTION_STATUSES,
} from "../constants/protocol";
import { PALETTE_TURN_MODE } from "../constants/conversation";
import { createChatChannel, type UseChatChannelResult } from "./useChatChannel";
import { useConversation, type UseConversationResult } from "./useConversation";
import { newUuid } from "../utils/ids";
import {
	usePermissionQueue,
	type UsePermissionQueueResult,
} from "./usePermissionQueue";
import {
	useQuestionQueue,
	type UseQuestionQueueResult,
} from "./useQuestionQueue";

export interface UsePaletteTurnOptions {
	transport: ChatTransport;
	prompt: string;
	/** The page the question is asked on. */
	getPagePath: () => string | undefined;
}

/**
 * One question asked from the command palette: a read-only turn (Plan only,
 * Safe mode) in a conversation of its own, followed over the tab's stream
 * next to the panel's chat, and folded by the panel's own conversation logic.
 */
export interface PaletteTurn {
	conversationId: string;
	channel: UseChatChannelResult;
	conversation: UseConversationResult;
	permissions: UsePermissionQueueResult;
	questions: UseQuestionQueueResult;
	/** The agent asks something only the full assistant can answer. */
	isWaitingForUser: ComputedRef<boolean>;
	/** Attaches to the stream; the question leaves once it is connected. */
	start: () => void;
	/**
	 * Lets the conversation go on elsewhere: stopping the palette's view of it
	 * no longer stops its turn.
	 */
	handOff: () => void;
	/** Detaches, stopping the turn unless it was handed off. */
	stop: () => void;
}

interface TurnState {
	isAsked: boolean;
	isHandedOff: boolean;
	stopListening: () => void;
}

function ask(
	options: UsePaletteTurnOptions,
	turn: PaletteTurn,
	state: TurnState,
): void {
	if (state.isAsked) return;
	state.isAsked = true;
	turn.channel.send({
		type: CLIENT_MESSAGE_TYPES.SET_CONVERSATION_MODE,
		conversationId: turn.conversationId,
		...PALETTE_TURN_MODE,
	});
	turn.conversation.sendUserMessage(options.prompt);
}

export function usePaletteTurn(options: UsePaletteTurnOptions): PaletteTurn {
	const conversationId = newUuid();
	const activeId = ref(conversationId);
	const channel = createChatChannel({
		transport: options.transport,
		getConversationId: () => conversationId,
		isFollowing: true,
	});
	const queueOptions = {
		activeId,
		send: channel.result.send,
		onMessage: channel.result.onMessage,
	};
	const permissions = usePermissionQueue(queueOptions);
	const questions = useQuestionQueue(queueOptions);
	const conversation = useConversation({
		...queueOptions,
		getPagePath: options.getPagePath,
	});
	const state: TurnState = {
		isAsked: false,
		isHandedOff: false,
		stopListening: () => undefined,
	};
	const turn: PaletteTurn = {
		conversationId,
		channel: channel.result,
		conversation,
		permissions,
		questions,
		isWaitingForUser: computed(
			() =>
				permissions.queue.value.length > 0 || questions.queue.value.length > 0,
		),
		start: () => {
			channel.start();
			state.stopListening = options.transport.onReady(() =>
				ask(options, turn, state),
			);
			if (options.transport.getStatus() === CONNECTION_STATUSES.CONNECTED)
				ask(options, turn, state);
		},
		handOff: () => {
			state.isHandedOff = true;
		},
		stop: () => {
			if (!state.isHandedOff) conversation.interrupt();
			state.stopListening();
			channel.stop();
		},
	};
	return turn;
}
