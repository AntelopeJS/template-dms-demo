/**
 * The sidecar's wire shapes the chat reads, mirrored by hand like the message
 * types (sidecar/src/protocol). Every field the redesign added is optional
 * here: the chat must keep working against a sidecar that does not send it yet.
 */

export type ProviderName = "claude" | "codex";
export type ApprovalMode = "normal" | "acceptEdits" | "plan";
export type Scope = "safe" | "vibe";
export type FullAutoDuration = "turn" | "30m" | "chat";

export type ToolOutcome = "done" | "failed" | "denied" | "blocked" | "stopped";

export type AllowedBy =
	| "read_auto"
	| "builder_auto"
	| "approved"
	| "rule"
	| "full_auto"
	| "blocked"
	| "denied"
	| "expired";

export type RuleKind = "file" | "directory" | "command" | "domain";

export interface PermissionRule {
	kind: RuleKind;
	value: string;
}

export interface ActiveRule extends PermissionRule {
	id: string;
	label: string;
	createdAtMs: number;
}

export type DiffLineKind = "context" | "add" | "remove";

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

export interface DiffPreview {
	type: "diff";
	path: string;
	relativePath: string;
	isNewFile: boolean;
	added: number;
	removed: number;
	hunks: DiffHunk[];
}

type CommandEffect = "adds_dependency" | "removes_dependency";

export interface CommandPreview {
	type: "command";
	command: string;
	cwd: string;
	effect?: CommandEffect;
	touches?: string[];
}

type DestructiveConsequence = "deletes_data" | "removes_code";

export interface DestructivePreview {
	type: "destructive";
	operation: string;
	target: string;
	consequence: DestructiveConsequence;
	confirmText?: string;
	canKeepData: boolean;
}

export interface WebPreview {
	type: "web";
	url: string;
	host: string;
}

interface GenericPreview {
	type: "generic";
	args: Record<string, unknown>;
}

export type PermissionPreview =
	| DiffPreview
	| CommandPreview
	| DestructivePreview
	| WebPreview
	| GenericPreview;

export type PermissionKind =
	| "edit"
	| "command"
	| "web"
	| "destructive"
	| "builder"
	| "other";

export type ChangeSetState = "applied" | "undone";
export type TypecheckOutcome = "passed" | "failed" | "skipped";
export type ChangeSetFileStatus = "added" | "modified" | "deleted";

export interface ChangeSetFile {
	path: string;
	status: ChangeSetFileStatus;
	added: number;
	removed: number;
}

export interface ChangeSetSummary {
	id: string;
	number: number;
	conversationId: string;
	title: string;
	createdAtMs: number;
	agent: ProviderName;
	scope: Scope;
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

export interface AutoFixNotice {
	kind: "autofix";
	attempt: number;
	maxAttempts: number;
	errors: string[];
	timestampMs: number;
}

export interface PermissionExpiredNotice {
	kind: "permission_expired";
	toolName: string;
	summary: string;
	timestampMs: number;
}

export interface QuestionSkippedNotice {
	kind: "question_skipped";
	header: string;
	timestampMs: number;
}

export interface FullAutoEndedNotice {
	kind: "full_auto_ended";
	timestampMs: number;
}

export type Notice =
	| AutoFixNotice
	| PermissionExpiredNotice
	| QuestionSkippedNotice
	| FullAutoEndedNotice;

export interface FullAutoState {
	duration: FullAutoDuration;
	untilMs?: number;
}

export interface ConversationModeState {
	mode: ApprovalMode;
	generationMode: Scope;
	fullAuto: FullAutoState | null;
}

export interface QuestionAnswerRecord {
	header: string;
	question: string;
	answer: string | null;
	skipped: boolean;
	isCustom: boolean;
}

export interface WireAttachment {
	name: string;
	mimeType: string;
	size: number;
	data: string;
}

export interface AttachmentMeta {
	name: string;
	mimeType: string;
	size: number;
}

/** One block of a preview tree, as the DMS `DmsBlockPreview` takes it. */
export interface PreviewNode {
	type?: string;
	componentName?: string;
	options?: Record<string, unknown>;
	id?: string;
	slot?: string;
	colSpan?: number;
	children?: PreviewNode[];
}

export type PreviewTree = PreviewNode | PreviewNode[];

/**
 * A custom component the agent proposes as static HTML and CSS, drawn in a
 * sandboxed frame. Never a DMS block.
 */
export interface PreviewSketch {
	html: string;
	css?: string;
	caption?: string;
	height?: number;
}

/** What one tab of a preview draws: DMS blocks, a sketch, or both. */
export interface PreviewView {
	tree?: PreviewTree;
	sketch?: PreviewSketch;
}

export interface BlockPreviewVariant extends PreviewView {
	label: string;
}

/**
 * The user's mockup a preview is compared with: an image they attached in the
 * conversation (by name) or a URL.
 */
export interface BlockPreviewReference {
	attachmentName?: string;
	url?: string;
	caption?: string;
}

/** A block preview the agent shared with its PreviewBlocks tool. */
export interface BlockPreview extends PreviewView {
	id: string;
	title: string;
	description?: string;
	label?: string;
	reference?: BlockPreviewReference;
	variants?: BlockPreviewVariant[];
	timestampMs: number;
}

export interface SnapshotMessage {
	role: string;
	content: string;
	toolName?: string;
	callId?: string;
	status?: string;
	attachments?: AttachmentMeta[];
	isRetryable?: boolean;
	timestampMs: number;
	outcome?: ToolOutcome;
	allowedBy?: AllowedBy;
	changeSetId?: string;
	notice?: Notice;
	answers?: QuestionAnswerRecord[];
	preview?: BlockPreview;
}

export interface QueuedItemWire {
	id: string;
	content: string;
	attachments?: WireAttachment[];
}
