import type { ActivityResult, AllowedBy } from "./types";
import type { Tone } from "#dms-ui/app/types/tone";

export const AI_ROUTES = {
	status: "/ai/status",
	changes: "/ai/changes",
	changeUndoConfirm: "/ai/changes/{{row.id}}/undo-confirm",
	activity: "/ai/activity",
} as const;

export const AI_PAGES = {
	changes: "/modules/ai/changes",
} as const;

export const CHANGE_SET_QUERY_KEY = "set";
export const CHANGES_PAGE_SIZE = 30;
export const HTTP_SERVICE_UNAVAILABLE = 503;

export interface DecisionStyle {
	icon: string;
	iconClass: string;
}

export const DECISION_STYLES: Record<AllowedBy, DecisionStyle> = {
	read_auto: { icon: "i-ph-eye", iconClass: "text-dimmed" },
	builder_auto: { icon: "i-ph-hammer", iconClass: "text-dimmed" },
	approved: { icon: "i-ph-check-circle", iconClass: "text-success" },
	rule: { icon: "i-ph-key", iconClass: "text-secondary" },
	full_auto: { icon: "i-ph-lightning", iconClass: "text-secondary" },
	blocked: { icon: "i-ph-shield-warning", iconClass: "text-warning" },
	denied: { icon: "i-ph-prohibit", iconClass: "text-error" },
	expired: { icon: "i-ph-hourglass-simple", iconClass: "text-warning" },
};

export const RESULT_TONES: Record<ActivityResult, Tone> = {
	done: "success",
	failed: "error",
	denied: "neutral",
	blocked: "warning",
	stopped: "neutral",
	pending: "warning",
	expired: "neutral",
};
