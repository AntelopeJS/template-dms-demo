import { type Ref, ref } from "vue";
import {
	CLIENT_MESSAGE_TYPES,
	FEEDBACK_MAX_CHARS,
	SERVER_EVENT_TYPES,
} from "../constants/protocol";
import type {
	ExpiredRequest,
	PermissionAnswer,
	PermissionRequestData,
} from "../types/permission";
import type {
	ActiveRule,
	PermissionKind,
	PermissionPreview,
	PermissionRule,
} from "../types/protocol";

export interface UsePermissionQueueOptions {
	activeId: Ref<string>;
	send: (msg: object) => boolean;
	onMessage: (handler: (msg: unknown) => void) => () => void;
}

export interface UsePermissionQueueResult {
	/** The active chat's pending requests, oldest first. */
	queue: Ref<PermissionRequestData[]>;
	/** Requests that went unanswered, until dismissed or asked again. */
	expired: Ref<ExpiredRequest[]>;
	/** What the user allowed for the rest of this chat. */
	rules: Ref<ActiveRule[]>;
	respond: (requestId: string, answer: PermissionAnswer) => void;
	/** Denies every pending request of the chat and stops its turn. */
	denyAll: () => void;
	revokeRule: (ruleId: string) => void;
	dismissExpired: (requestId: string) => void;
	clear: () => void;
}

interface PermissionRequestWire {
	conversationId: string;
	requestId: string;
	callId?: string;
	toolName: string;
	args: unknown;
	summary: string;
	kind: PermissionKind;
	alwaysAsk: boolean;
	preview: PermissionPreview;
	ruleOptions: PermissionRule[];
	createdAtMs: number;
	expiresAtMs: number;
}

interface PermissionExpiredWire {
	conversationId: string;
	requestId: string;
	toolName?: string;
	summary?: string;
	expiredAtMs?: number;
}

interface RequestIdWire {
	requestId: string;
}

interface RulesStateWire {
	rules?: ActiveRule[];
}

interface QueueState {
	options: UsePermissionQueueOptions;
	queue: Ref<PermissionRequestData[]>;
	expired: Ref<ExpiredRequest[]>;
	rules: Ref<ActiveRule[]>;
}

type QueueHandler = (state: QueueState, event: never) => void;

/** A request as the dock reads it: an always-ask one never offers a rule. */
function toPermissionRequest(
	wire: PermissionRequestWire,
): PermissionRequestData {
	return {
		requestId: wire.requestId,
		conversationId: wire.conversationId,
		callId: wire.callId,
		toolName: wire.toolName,
		args: wire.args,
		summary: wire.summary,
		kind: wire.kind,
		alwaysAsk: wire.alwaysAsk,
		preview: wire.preview,
		ruleOptions: wire.alwaysAsk ? [] : wire.ruleOptions,
		createdAtMs: wire.createdAtMs,
		expiresAtMs: wire.expiresAtMs,
	};
}

function without(state: QueueState, requestId: string): void {
	state.queue.value = state.queue.value.filter(
		(req) => req.requestId !== requestId,
	);
}

function enqueue(state: QueueState, wire: PermissionRequestWire): void {
	if (state.queue.value.some((req) => req.requestId === wire.requestId)) return;
	state.queue.value = [...state.queue.value, toPermissionRequest(wire)];
}

function expire(state: QueueState, wire: PermissionExpiredWire): void {
	const pending = state.queue.value.find(
		(req) => req.requestId === wire.requestId,
	);
	without(state, wire.requestId);
	if (state.expired.value.some((req) => req.requestId === wire.requestId))
		return;
	state.expired.value = [
		...state.expired.value,
		{
			requestId: wire.requestId,
			conversationId: wire.conversationId,
			toolName: wire.toolName ?? pending?.toolName ?? "",
			summary: wire.summary ?? pending?.summary ?? "",
			expiredAtMs: wire.expiredAtMs ?? Date.now(),
		},
	];
}

const HANDLERS: Record<string, QueueHandler> = {
	[SERVER_EVENT_TYPES.PERMISSION_REQUEST]: enqueue,
	[SERVER_EVENT_TYPES.PERMISSION_EXPIRED]: expire,
	[SERVER_EVENT_TYPES.PERMISSION_RESOLVED]: (state, event: RequestIdWire) =>
		without(state, event.requestId),
	[SERVER_EVENT_TYPES.RULES_STATE]: (state, event: RulesStateWire) => {
		state.rules.value = event.rules ?? [];
	},
};

function dispatch(state: QueueState, msg: unknown): void {
	if (msg === null || typeof msg !== "object") return;
	const event = msg as Record<string, unknown>;
	const handler = HANDLERS[String(event.type)];
	if (handler === undefined) return;
	const conversationId = event.conversationId;
	if (
		typeof conversationId === "string" &&
		conversationId !== state.options.activeId.value
	)
		return;
	handler(state, msg as never);
}

function answerMessage(
	req: PermissionRequestData,
	answer: PermissionAnswer,
): object {
	const feedback = answer.feedback?.trim().slice(0, FEEDBACK_MAX_CHARS);
	return {
		type: CLIENT_MESSAGE_TYPES.PERMISSION_RESPONSE,
		conversationId: req.conversationId,
		requestId: req.requestId,
		decision: answer.decision,
		...(answer.rule === undefined ? {} : { rule: answer.rule }),
		...(feedback ? { feedback } : {}),
		...(answer.keepData === true ? { keepData: true } : {}),
	};
}

function respond(
	state: QueueState,
	requestId: string,
	answer: PermissionAnswer,
): void {
	const target = state.queue.value.find((req) => req.requestId === requestId);
	if (target === undefined) return;
	if (!state.options.send(answerMessage(target, answer))) return;
	without(state, requestId);
}

function denyAll(state: QueueState): void {
	const first = state.queue.value[0];
	if (first === undefined) return;
	const isSent = state.options.send({
		type: CLIENT_MESSAGE_TYPES.PERMISSION_RESPONSE,
		conversationId: first.conversationId,
		requestId: first.requestId,
		decision: "deny_all",
	});
	if (isSent) state.queue.value = [];
}

function revokeRule(state: QueueState, ruleId: string): void {
	const isSent = state.options.send({
		type: CLIENT_MESSAGE_TYPES.REVOKE_RULE,
		conversationId: state.options.activeId.value,
		ruleId,
	});
	if (!isSent) return;
	state.rules.value = state.rules.value.filter((rule) => rule.id !== ruleId);
}

/**
 * The approvals of the active chat: pending requests with their previews,
 * those that expired, and the rules the user granted. Requests another tab
 * answered leave as soon as the sidecar says so.
 */
export function usePermissionQueue(
	options: UsePermissionQueueOptions,
): UsePermissionQueueResult {
	const state: QueueState = {
		options,
		queue: ref<PermissionRequestData[]>([]),
		expired: ref<ExpiredRequest[]>([]),
		rules: ref<ActiveRule[]>([]),
	};
	options.onMessage((msg) => dispatch(state, msg));
	return {
		queue: state.queue,
		expired: state.expired,
		rules: state.rules,
		respond: (requestId, answer) => respond(state, requestId, answer),
		denyAll: () => denyAll(state),
		revokeRule: (ruleId) => revokeRule(state, ruleId),
		dismissExpired: (requestId) => {
			state.expired.value = state.expired.value.filter(
				(req) => req.requestId !== requestId,
			);
		},
		clear: () => {
			state.queue.value = [];
			state.expired.value = [];
			state.rules.value = [];
		},
	};
}
