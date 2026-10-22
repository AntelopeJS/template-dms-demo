import { TOOL_STATUS } from "../constants/conversation";
import type { ToolCallMessage, ToolRowState } from "../types/conversation";
import type { PermissionRequestData } from "../types/permission";

/** Where a waiting call's request sits in the dock: "1 of 2". */
export interface WaitingPosition {
	index: number;
	total: number;
	requestId: string;
}

/**
 * The pending request a call waits on: the one carrying its call id, or, for a
 * sidecar that sends none, the oldest request for the same tool while the
 * call is still open.
 */
export function findWaitingRequest(
	tool: ToolCallMessage,
	requests: readonly PermissionRequestData[],
): WaitingPosition | null {
	const byCallId = requests.findIndex((req) => req.callId === tool.callId);
	const index =
		byCallId !== -1
			? byCallId
			: requests.findIndex(
					(req) => req.callId === undefined && req.toolName === tool.toolName,
				);
	if (index === -1) return null;
	return {
		index,
		total: requests.length,
		requestId: requests[index].requestId,
	};
}

function isOpen(tool: ToolCallMessage): boolean {
	return tool.outcome === undefined && tool.status === TOOL_STATUS.PENDING;
}

/**
 * One of the seven row states. An open call is waiting when a request names
 * it, running while its turn is, and stopped once the turn is over without
 * closing it.
 */
export function toolRowState(
	tool: ToolCallMessage,
	isTurnRunning: boolean,
	waiting: WaitingPosition | null,
): ToolRowState {
	if (tool.outcome !== undefined) return tool.outcome;
	if (!isOpen(tool)) return "done";
	if (waiting !== null) return "waiting";
	return isTurnRunning ? "running" : "stopped";
}

/** How long a closed call took, when both ends are known. */
export function toolDurationMs(tool: ToolCallMessage): number | null {
	if (tool.endedAtMs === undefined) return null;
	return Math.max(0, tool.endedAtMs - tool.timestampMs);
}
