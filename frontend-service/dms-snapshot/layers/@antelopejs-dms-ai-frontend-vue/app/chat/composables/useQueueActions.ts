import type { Ref } from "vue";
import { CLIENT_MESSAGE_TYPES } from "../constants/protocol";
import type { QueuedMessage } from "../types/conversation";
import { moveItem } from "../utils/queue";

export interface UseQueueActionsOptions {
	activeId: Ref<string>;
	queued: Ref<QueuedMessage[]>;
	send: (msg: object) => boolean;
}

export interface UseQueueActionsResult {
	cancel: (id: string) => void;
	update: (id: string, content: string) => void;
	move: (id: string, toIndex: number) => void;
	clear: () => void;
}

/**
 * Edits to the follow-up queue. The sidecar owns it and answers each change
 * with the new `queue_state`; the chat shows the change at once meanwhile.
 */
export function useQueueActions(
	options: UseQueueActionsOptions,
): UseQueueActionsResult {
	const send = (type: string, fields: Record<string, unknown>): boolean =>
		options.send({
			type,
			conversationId: options.activeId.value,
			...fields,
		});

	return {
		cancel: (id) => {
			if (!send(CLIENT_MESSAGE_TYPES.QUEUE_CANCEL, { id })) return;
			options.queued.value = options.queued.value.filter(
				(item) => item.id !== id,
			);
		},
		update: (id, content) => {
			if (!send(CLIENT_MESSAGE_TYPES.QUEUE_UPDATE, { id, content })) return;
			options.queued.value = options.queued.value.map((item) =>
				item.id === id ? { ...item, content } : item,
			);
		},
		move: (id, toIndex) => {
			if (!send(CLIENT_MESSAGE_TYPES.QUEUE_MOVE, { id, toIndex })) return;
			options.queued.value = moveItem(options.queued.value, id, toIndex);
		},
		clear: () => {
			if (!send(CLIENT_MESSAGE_TYPES.QUEUE_CLEAR, {})) return;
			options.queued.value = [];
		},
	};
}
