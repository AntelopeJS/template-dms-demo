import type {
	PermissionKind,
	PermissionPreview,
	PermissionRule,
} from "./protocol";

/** A permission request as the approvals dock shows it. */
export interface PermissionRequestData {
	requestId: string;
	conversationId: string;
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

/** A request the sidecar denied for want of an answer, kept until dismissed. */
export interface ExpiredRequest {
	requestId: string;
	conversationId: string;
	toolName: string;
	summary: string;
	expiredAtMs: number;
}

/** What the user chose on a card, before it becomes a wire message. */
export interface PermissionAnswer {
	decision: "allow_once" | "allow_rule" | "deny";
	rule?: PermissionRule;
	feedback?: string;
	keepData?: boolean;
}
