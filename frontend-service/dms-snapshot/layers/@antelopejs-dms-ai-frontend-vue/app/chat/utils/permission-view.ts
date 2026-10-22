import type { PermissionRequestData } from "../types/permission";
import type { Translate } from "../composables/useChatI18n";
import type {
	CommandPreview,
	DestructivePreview,
	DiffPreview,
	PermissionPreview,
	PermissionRule,
	RuleKind,
	WebPreview,
} from "../types/protocol";
import { bareToolName, describeTool, toolVerb } from "./tool-lexicon";

/** How a card names its request, in the user's language. */
export interface PermissionCardText {
	title: string;
	sub: string;
	/** "Only this edit", "Only this command"… */
	onceLabel: string;
	allowLabel: string;
	/** Why the request asks even where most do not; empty when it needs no word. */
	why: string;
}

const PATH_SEPARATOR = "/";

function baseName(path: string): string {
	return path.split(PATH_SEPARATOR).filter(Boolean).at(-1) ?? path;
}

function verbAndTarget(req: PermissionRequestData, t: Translate): string {
	const description = describeTool(req.toolName, req.args);
	const verb = toolVerb(description, t);
	return description.target === "" ? verb : `${verb} ${description.target}`;
}

type TextBuilder = (
	req: PermissionRequestData,
	preview: never,
	t: Translate,
) => PermissionCardText;

const TEXT_BY_PREVIEW: Record<PermissionPreview["type"], TextBuilder> = {
	diff: (_req, preview: DiffPreview, t) => ({
		title: t(
			preview.isNewFile
				? "dms_ai.panel.approvals.create_file"
				: "dms_ai.panel.approvals.edit_file",
			{ file: baseName(preview.relativePath || preview.path) },
		),
		sub: preview.relativePath || preview.path,
		onceLabel: t("dms_ai.panel.approvals.once_edit"),
		allowLabel: t("dms_ai.panel.approvals.allow_edit"),
		why: "",
	}),
	command: (_req, preview: CommandPreview, t) => ({
		title: t("dms_ai.panel.approvals.run", { command: preview.command }),
		sub: commandSub(preview, t),
		onceLabel: t("dms_ai.panel.approvals.once_command"),
		allowLabel: t("dms_ai.panel.approvals.allow_command"),
		why: "",
	}),
	destructive: (req, preview: DestructivePreview, t) => ({
		title: destructiveTitle(req, preview, t),
		sub: t(`dms_ai.panel.approvals.consequence_${preview.consequence}`),
		onceLabel: t("dms_ai.panel.approvals.once_time"),
		allowLabel: t("dms_ai.panel.approvals.confirm_delete"),
		why: t(`dms_ai.panel.approvals.why_${preview.consequence}`),
	}),
	web: (_req, preview: WebPreview, t) => ({
		title: t("dms_ai.panel.approvals.fetch", { host: preview.host }),
		sub: preview.url,
		onceLabel: t("dms_ai.panel.approvals.once_request"),
		allowLabel: t("dms_ai.panel.approvals.allow_request"),
		why: "",
	}),
	generic: (req, _preview, t) => ({
		title: verbAndTarget(req, t),
		sub: "",
		onceLabel: t("dms_ai.panel.approvals.once_time"),
		allowLabel: t("dms_ai.panel.approvals.allow"),
		why: req.kind === "builder" ? t("dms_ai.panel.approvals.why_builder") : "",
	}),
};

/** "Delete the page {target}": the Builder's destructive operations by name. */
const DESTRUCTIVE_TITLE_KEYS: Record<string, string> = {
	BuilderDeletePage: "dms_ai.panel.approvals.destructive.delete_page",
	BuilderDeleteResource: "dms_ai.panel.approvals.destructive.delete_table",
	BuilderRemoveField: "dms_ai.panel.approvals.destructive.remove_field",
	BuilderDeleteCategory: "dms_ai.panel.approvals.destructive.delete_category",
	BuilderRemoveQuery: "dms_ai.panel.approvals.destructive.remove_query",
};

function destructiveTitle(
	req: PermissionRequestData,
	preview: DestructivePreview,
	t: Translate,
): string {
	const operation = bareToolName(preview.operation || req.toolName);
	const key = DESTRUCTIVE_TITLE_KEYS[operation];
	if (key !== undefined) return t(key, { target: preview.target });
	const verb = toolVerb(describeTool(operation, req.args), t);
	return preview.target === "" ? verb : `${verb} ${preview.target}`;
}

function commandSub(preview: CommandPreview, t: Translate): string {
	const touches = (preview.touches ?? []).join(", ");
	if (preview.effect === undefined) return touches || preview.cwd;
	const effect = t(`dms_ai.panel.approvals.effect_${preview.effect}`);
	return touches === "" ? effect : `${effect} · ${touches}`;
}

/** The words of a permission card, read from its preview. */
export function permissionCardText(
	req: PermissionRequestData,
	t: Translate,
): PermissionCardText {
	const build = TEXT_BY_PREVIEW[req.preview.type] ?? TEXT_BY_PREVIEW.generic;
	return build(req, req.preview as never, t);
}

const RULE_LABEL_KEYS: Record<RuleKind, string> = {
	file: "dms_ai.panel.approvals.rule_file",
	directory: "dms_ai.panel.approvals.rule_directory",
	command: "dms_ai.panel.approvals.rule_command",
	domain: "dms_ai.panel.approvals.rule_domain",
};

/** A scope as the card offers it: "Every edit under crm/customers/". */
export function ruleLabelKey(rule: PermissionRule): string {
	return RULE_LABEL_KEYS[rule.kind];
}

const RULE_ICONS: Record<RuleKind, string> = {
	file: "i-ph-pencil-simple-line",
	directory: "i-ph-folder-simple",
	command: "i-ph-terminal-window",
	domain: "i-ph-globe",
};

export function ruleIcon(kind: RuleKind): string {
	return RULE_ICONS[kind] ?? "i-ph-key";
}

const KIND_ICONS: Record<string, string> = {
	edit: "i-ph-pencil-simple-line",
	command: "i-ph-terminal-window",
	web: "i-ph-globe",
	destructive: "i-ph-trash",
	builder: "i-ph-squares-four",
	other: "i-ph-hand-palm",
};

/** The card's icon: by kind, else the tool's own. */
export function permissionIcon(req: PermissionRequestData): string {
	if (req.kind === "other") return describeTool(req.toolName, req.args).icon;
	return KIND_ICONS[req.kind] ?? KIND_ICONS.other;
}
