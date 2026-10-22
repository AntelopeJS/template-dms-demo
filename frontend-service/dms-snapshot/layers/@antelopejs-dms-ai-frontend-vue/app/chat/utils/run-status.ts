import {
	ACTIVITY_ELLIPSIS,
	ACTIVITY_KINDS,
	ACTIVITY_LABEL_KEYS,
	QUIET_NOTICE_AFTER_MS,
	SILENT_ACTIVITIES,
	STALL_AFTER_MS,
	TOOL_DETAIL_ACTIVITIES,
} from "../constants/run-status";
import type { ActivityKind, RunProgress } from "../types/conversation";
import { describeTool, toolVerb } from "./tool-lexicon";

const DETAIL_SEPARATOR = " · ";

const KNOWN_ACTIVITIES: readonly string[] = Object.values(ACTIVITY_KINDS);

export { formatClock } from "./format";

/** A reported activity, read as thinking when this chat does not know it. */
export function toActivityKind(reported: string): ActivityKind {
	if (!KNOWN_ACTIVITIES.includes(reported)) return ACTIVITY_KINDS.THINKING;
	return reported as ActivityKind;
}

function describeDetail(
	progress: RunProgress,
	translate: (key: string) => string,
): string {
	if (progress.detail === undefined || progress.detail === "") return "";
	const namesTool = TOOL_DETAIL_ACTIVITIES.includes(progress.activity);
	const detail = namesTool
		? toolVerb(describeTool(progress.detail, null), translate)
		: progress.detail;
	return `${DETAIL_SEPARATOR}${detail}`;
}

/** The line a running turn shows: what the agent is doing, and on what. */
export function describeActivity(
	progress: RunProgress | null,
	translate: (key: string) => string,
): string {
	const kind = progress?.activity ?? ACTIVITY_KINDS.THINKING;
	const label = translate(ACTIVITY_LABEL_KEYS[kind]);
	const detail = progress === null ? "" : describeDetail(progress, translate);
	return `${label}${detail}${ACTIVITY_ELLIPSIS}`;
}

function sinceReport(progress: RunProgress, nowMs: number): number {
	return Math.max(0, nowMs - progress.receivedAtMs);
}

/** Time since the turn started, counted on from the last report. */
export function runElapsedMs(
	progress: RunProgress | null,
	nowMs: number,
): number {
	if (progress === null) return 0;
	return progress.elapsedMs + sinceReport(progress, nowMs);
}

/** Time since the agent last did anything, counted on from the last report. */
export function agentQuietMs(
	progress: RunProgress | null,
	nowMs: number,
): number {
	if (progress === null) return 0;
	return progress.idleMs + sinceReport(progress, nowMs);
}

/** Whether the agent has been quiet long enough for the chat to say so. */
export function isAgentQuiet(
	progress: RunProgress | null,
	nowMs: number,
): boolean {
	if (progress === null) return false;
	if (SILENT_ACTIVITIES.includes(progress.activity)) return false;
	return agentQuietMs(progress, nowMs) >= QUIET_NOTICE_AFTER_MS;
}

/**
 * Whether the sidecar has said nothing about a running turn, heartbeats
 * included, for so long that the chat can no longer vouch for it.
 */
export function isRunStalled(lastEventAtMs: number, nowMs: number): boolean {
	return nowMs - lastEventAtMs >= STALL_AFTER_MS;
}
