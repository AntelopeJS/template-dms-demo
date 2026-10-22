import type { ActivityKind } from "../types/conversation";

/** What a running turn can be busy with, as the sidecar reports it. */
export const ACTIVITY_KINDS = {
	THINKING: "thinking",
	RESPONDING: "responding",
	WRITING: "writing",
	TOOL: "tool",
	COMPACTING: "compacting",
	RETRYING: "retrying",
} as const;

/** Translation key of what a running turn shows, by reported activity. */
export const ACTIVITY_LABEL_KEYS: Record<ActivityKind, string> = {
	[ACTIVITY_KINDS.THINKING]: "dms_ai.panel.activity.thinking",
	[ACTIVITY_KINDS.RESPONDING]: "dms_ai.panel.activity.responding",
	[ACTIVITY_KINDS.WRITING]: "dms_ai.panel.activity.writing",
	[ACTIVITY_KINDS.TOOL]: "dms_ai.panel.activity.tool",
	[ACTIVITY_KINDS.COMPACTING]: "dms_ai.panel.activity.compacting",
	[ACTIVITY_KINDS.RETRYING]: "dms_ai.panel.activity.retrying",
};

/** Activities whose detail names a tool, shown with the tool's own label. */
export const TOOL_DETAIL_ACTIVITIES: readonly ActivityKind[] = [
	ACTIVITY_KINDS.WRITING,
	ACTIVITY_KINDS.TOOL,
];

/** Activities during which a silent agent is expected, so never called quiet. */
export const SILENT_ACTIVITIES: readonly ActivityKind[] = [ACTIVITY_KINDS.TOOL];

export const ACTIVITY_ELLIPSIS = "…";

/**
 * How long a running turn may go without any word from the sidecar, heartbeats
 * included, before the chat says it lost track of it. The sidecar beats every
 * 5 seconds, so this is several missed beats, never a slow step.
 */
export const STALL_AFTER_MS = 20_000;

/** From how long without agent activity the chat says so next to the label. */
export const QUIET_NOTICE_AFTER_MS = 60_000;

export const RUN_CLOCK_TICK_MS = 1_000;
