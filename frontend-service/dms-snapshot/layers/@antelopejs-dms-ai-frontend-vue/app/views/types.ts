import type { Tone } from "#dms-ui/app/types/tone";

type AgentId = "claude" | "codex";
export type ScopeId = "safe" | "vibe";
export type ApprovalMode = "normal" | "acceptEdits" | "plan";
type AssistantState = "ready" | "working" | "waiting";
export type TypecheckOutcome = "passed" | "failed" | "skipped";
export type ChangeSetState = "applied" | "undone";
export type ChangeFileStatus = "added" | "modified" | "deleted";
export type DiffLineKind = "context" | "add" | "remove";
export type SkillSource = "module" | "local";

export type AllowedBy =
	| "read_auto"
	| "builder_auto"
	| "approved"
	| "rule"
	| "full_auto"
	| "blocked"
	| "denied"
	| "expired";

export type ActivityResult =
	| "done"
	| "failed"
	| "denied"
	| "blocked"
	| "stopped"
	| "pending"
	| "expired";

export interface DiffLine {
	kind: DiffLineKind;
	text: string;
	oldLine?: number;
	newLine?: number;
}

export interface DiffHunk {
	oldStart: number;
	newStart: number;
	lines: DiffLine[];
}

/** One file of a diff, as DiffView draws it. */
export interface DiffFile {
	path: string;
	status?: ChangeFileStatus;
	added?: number;
	removed?: number;
	hunks: DiffHunk[];
	isBinary?: boolean;
}

export interface ChangeSetFile {
	path: string;
	status: ChangeFileStatus;
	added: number;
	removed: number;
}

export interface ChangeSetSummary {
	id: string;
	number: number;
	conversationId: string;
	title: string;
	createdAtMs: number;
	agent: AgentId;
	scope: ScopeId;
	isAutoFix: boolean;
	overlapped: boolean;
	files: ChangeSetFile[];
	added: number;
	removed: number;
	typecheck: TypecheckOutcome;
	state: ChangeSetState;
	stateChangedAtMs?: number;
	stateChangedBy?: string;
	askedBy?: string;
	approvalsNeeded: number;
	builderOps: number;
}

export interface ChangeSetDetail {
	changeSet: ChangeSetSummary;
	files: DiffFile[];
	conversationTitle: string;
	pagePath?: string;
}

export interface ListPayload<T> {
	results: T[];
	total: number;
}

export interface ActivityRow {
	_id?: string;
	id: string;
	timestampMs: number;
	tool: string;
	target: string;
	agent: AgentId;
	allowedBy: AllowedBy;
	result: ActivityResult;
	resultDetail?: string;
	changeSetId?: string;
	changeSetNumber?: number;
	conversationId: string;
	conversationTitle: string;
	durationMs?: number;
	isReadOnly: boolean;
	isAutoFix: boolean;
	added?: number;
	removed?: number;
	expiresAtMs?: number;
}

export interface DecisionStep {
	atMs: number;
	label: string;
}

export interface ActivityDiffFile {
	path: string;
	hunks: DiffHunk[];
}

/**
 * `GET /ai/activity/:id`. The contract names the call's (truncated) output
 * `result`, the same key as the row's outcome: both readings are accepted.
 */
export interface ActivityDetailPayload extends Omit<ActivityRow, "result"> {
	args?: Record<string, unknown>;
	result?: string;
	output?: string;
	diff?: ActivityDiffFile[];
	decisionTrail?: DecisionStep[];
}

export interface AssistantStatus {
	status: AssistantState;
	provider: AgentId;
	providers?: unknown;
	builderAvailable: boolean;
	mode: ApprovalMode;
	generationMode: ScopeId;
	workingConversations: number;
	pendingApprovals: number;
	pendingQuestions: number;
	port: number;
	version?: string;
	lastError?: string;
	checkpointsAvailable: boolean;
}

export interface SkillRow {
	_id: string;
	name: string;
	description: string;
	source: SkillSource;
	origin: string;
	tags: string[];
	uses30d: number;
	lastUsedAtMs?: number;
	lastConversationId?: string;
	isShadowed: boolean;
	shadowedBy?: string;
	body: string;
	qualifiedName: string;
	icon?: string;
}

/** What a DMS row drawer hands its component to step through the rows. */
export interface RowNavigation {
	index: number;
	total: number;
	hasPrev: boolean;
	hasNext: boolean;
	prev: () => void;
	next: () => void;
}

/** One fact of a change set, a row of a DmsKeyValueList. */
export interface Fact {
	id: string;
	label: string;
	value: string;
	tone?: Tone;
}
