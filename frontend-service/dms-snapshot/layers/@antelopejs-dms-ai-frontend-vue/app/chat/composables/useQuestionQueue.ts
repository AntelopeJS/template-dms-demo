import { type Ref, ref } from "vue";
import {
	CLIENT_MESSAGE_TYPES,
	SERVER_EVENT_TYPES,
} from "../constants/protocol";
import type { QuestionAnswerRecord } from "../types/protocol";
import type {
	QuestionData,
	QuestionReply,
	QuestionRequestData,
} from "../types/question";

export interface UseQuestionQueueOptions {
	activeId: Ref<string>;
	send: (msg: object) => boolean;
	onMessage: (handler: (msg: unknown) => void) => () => void;
}

export interface UseQuestionQueueResult {
	queue: Ref<QuestionRequestData[]>;
	/**
	 * Sends the replies, one per question. Answers what the transcript keeps of
	 * them, or null when nothing was sent.
	 */
	respond: (
		requestId: string,
		replies: QuestionReply[],
	) => QuestionAnswerRecord[] | null;
	clear: () => void;
}

interface AskQuestionWire {
	conversationId: string;
	requestId: string;
	questions: QuestionData[];
	createdAtMs: number;
	expiresAtMs: number;
}

interface RequestIdWire {
	requestId: string;
}

function toRequest(wire: AskQuestionWire): QuestionRequestData {
	return {
		requestId: wire.requestId,
		conversationId: wire.conversationId,
		questions: wire.questions,
		createdAtMs: wire.createdAtMs,
		expiresAtMs: wire.expiresAtMs,
	};
}

/** What the transcript keeps of each answer. */
function toAnswerRecords(
	questions: readonly QuestionData[],
	replies: readonly QuestionReply[],
): QuestionAnswerRecord[] {
	return questions.map((question, index) => {
		const reply = replies[index];
		const isSkipped = reply === undefined || reply.skipped;
		return {
			header: question.header,
			question: question.question,
			answer: isSkipped ? null : reply.answer,
			skipped: isSkipped,
			isCustom: !isSkipped && reply.isCustom,
		};
	});
}

function responseMessage(
	req: QuestionRequestData,
	replies: readonly QuestionReply[],
): object {
	const skipped = req.questions.map(
		(_, index) => replies[index]?.skipped ?? true,
	);
	return {
		type: CLIENT_MESSAGE_TYPES.QUESTION_RESPONSE,
		conversationId: req.conversationId,
		requestId: req.requestId,
		answers: req.questions.map((_, index) =>
			skipped[index] ? "" : (replies[index]?.answer ?? ""),
		),
		...(skipped.some(Boolean) ? { skipped } : {}),
	};
}

function isForActive(msg: Record<string, unknown>, activeId: string): boolean {
	const id = msg.conversationId;
	return typeof id !== "string" || id === activeId;
}

/**
 * The questions the agent waits on in the active chat. Answering sends the
 * replies and gives back what the transcript keeps of them; a question the
 * sidecar timed out simply leaves.
 */
export function useQuestionQueue(
	options: UseQuestionQueueOptions,
): UseQuestionQueueResult {
	const queue = ref<QuestionRequestData[]>([]);
	const drop = (requestId: string): void => {
		queue.value = queue.value.filter((req) => req.requestId !== requestId);
	};

	options.onMessage((msg) => {
		if (msg === null || typeof msg !== "object") return;
		const event = msg as Record<string, unknown>;
		if (!isForActive(event, options.activeId.value)) return;
		if (event.type === SERVER_EVENT_TYPES.QUESTION_EXPIRED)
			drop((msg as RequestIdWire).requestId);
		if (event.type !== SERVER_EVENT_TYPES.ASK_QUESTION) return;
		const wire = msg as AskQuestionWire;
		if (queue.value.some((req) => req.requestId === wire.requestId)) return;
		queue.value = [...queue.value, toRequest(wire)];
	});

	const respond = (
		requestId: string,
		replies: QuestionReply[],
	): QuestionAnswerRecord[] | null => {
		const target = queue.value.find((req) => req.requestId === requestId);
		if (target === undefined) return null;
		if (!options.send(responseMessage(target, replies))) return null;
		drop(requestId);
		return toAnswerRecords(target.questions, replies);
	};

	return { queue, respond, clear: () => (queue.value = []) };
}
