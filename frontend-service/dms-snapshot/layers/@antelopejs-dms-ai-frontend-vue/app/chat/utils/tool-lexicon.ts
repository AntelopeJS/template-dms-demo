/**
 * The chat's tool lexicon: every tool the agents call (Claude built-ins, the
 * Codex items the sidecar maps onto them, dms-ai's MCP tools and the
 * Builder's) as a translated verb, an icon and a target read from its
 * arguments, so a row reads "Add block · Top customers · TopListCard" rather
 * than a tool name and a JSON blob.
 */

const MCP_PREFIX = /^mcp__[^_]+(?:_[^_]+)*?__/;
const WORD_BOUNDARY = /([a-z0-9])([A-Z])/g;
const SEPARATORS = /[_\s-]+/g;
const MAX_TARGET_CHARS = 72;
const ELLIPSIS = "…";
const TARGET_SEPARATOR = " · ";
const PATH_SEPARATOR = "/";
const DEFAULT_ICON = "i-ph-wrench";

/** Where a tool's target comes from in its arguments. */
type TargetReader = (args: Record<string, unknown>) => string;

interface ToolLexiconEntry {
	/** Key under `dms_ai.tools.*`. */
	verb: string;
	icon: string;
	target: TargetReader;
	/** Reads only: never changes the project. */
	isReadOnly?: boolean;
}

export interface ToolDescription {
	/** Translation key of the verb, or null for a tool the lexicon lacks. */
	verbKey: string | null;
	/** Readable form of the raw name, used when `verbKey` is null. */
	fallbackVerb: string;
	icon: string;
	target: string;
	isReadOnly: boolean;
}

function readString(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	return "";
}

function firstOf(...keys: string[]): TargetReader {
	return (args) =>
		keys.map((key) => readString(args, key)).find((v) => v !== "") ?? "";
}

function baseName(path: string): string {
	const trimmed = path.replace(/\/+$/, "");
	return trimmed.split(PATH_SEPARATOR).at(-1) ?? trimmed;
}

function fileOf(...keys: string[]): TargetReader {
	const read = firstOf(...keys);
	return (args) => baseName(read(args));
}

function quoted(...keys: string[]): TargetReader {
	const read = firstOf(...keys);
	return (args) => {
		const value = read(args);
		return value === "" ? "" : `“${value}”`;
	};
}

function joined(...readers: TargetReader[]): TargetReader {
	return (args) =>
		readers
			.map((read) => read(args))
			.filter((part) => part !== "")
			.join(TARGET_SEPARATOR);
}

function hostOf(key: string): TargetReader {
	return (args) => {
		const url = readString(args, key);
		try {
			const parsed = new URL(url);
			return `${parsed.host}${parsed.pathname === PATH_SEPARATOR ? "" : parsed.pathname}`;
		} catch {
			return url;
		}
	};
}

function countOf(key: string): TargetReader {
	return (args) => {
		const value = args[key];
		return Array.isArray(value) ? String(value.length) : "";
	};
}

function nested(key: string, inner: string): TargetReader {
	return (args) => {
		const value = args[key];
		if (value === null || typeof value !== "object") return "";
		return readString(value as Record<string, unknown>, inner);
	};
}

const none: TargetReader = () => "";

const TOOL_QUERY_PREFIX = /^select:/;
const TOOL_LIST_SEPARATOR = ",";

/** "select:mcp__dms-ai__ListPages,…" → "ListPages, …". */
const toolQuery: TargetReader = (args) =>
	readString(args, "query")
		.replace(TOOL_QUERY_PREFIX, "")
		.split(TOOL_LIST_SEPARATOR)
		.map((name) => name.trim().replace(MCP_PREFIX, ""))
		.join(", ");

const ICONS = {
	READ: "i-ph-file-text",
	EDIT: "i-ph-pencil-simple-line",
	COMMAND: "i-ph-terminal-window",
	SEARCH: "i-ph-magnifying-glass",
	FOLDER: "i-ph-folder-simple",
	WEB: "i-ph-globe",
	STEPS: "i-ph-list-checks",
	DELEGATE: "i-ph-robot",
	ASK: "i-ph-question",
	PAGE: "i-ph-tree-structure",
	BLOCK: "i-ph-squares-four",
	DATA: "i-ph-database",
	CHECK: "i-ph-shield-check",
	OPEN: "i-ph-arrow-square-out",
	BROWSER: "i-ph-browser",
	CREATE_PAGE: "i-ph-folder-simple-plus",
	DELETE: "i-ph-trash",
	TABLE: "i-ph-table",
	FIELD: "i-ph-textbox",
	LOGS: "i-ph-scroll",
	SKILL: "i-ph-books",
	PLAN: "i-ph-list-checks",
	PREVIEW: "i-ph-frame-corners",
	REFRESH: "i-ph-arrows-clockwise",
	CATEGORY: "i-ph-folders",
} as const;

const CLAUDE_TOOLS: Record<string, ToolLexiconEntry> = {
	Read: {
		verb: "read_file",
		icon: ICONS.READ,
		target: fileOf("file_path"),
		isReadOnly: true,
	},
	Write: { verb: "write_file", icon: ICONS.EDIT, target: fileOf("file_path") },
	Edit: { verb: "edit_file", icon: ICONS.EDIT, target: fileOf("file_path") },
	MultiEdit: {
		verb: "edit_file",
		icon: ICONS.EDIT,
		target: fileOf("file_path"),
	},
	NotebookEdit: {
		verb: "edit_notebook",
		icon: ICONS.EDIT,
		target: fileOf("notebook_path"),
	},
	Bash: {
		verb: "run_command",
		icon: ICONS.COMMAND,
		target: firstOf("command"),
	},
	BashOutput: {
		verb: "read_output",
		icon: ICONS.COMMAND,
		target: firstOf("bash_id"),
		isReadOnly: true,
	},
	KillShell: {
		verb: "stop_command",
		icon: ICONS.COMMAND,
		target: firstOf("shell_id"),
	},
	KillBash: {
		verb: "stop_command",
		icon: ICONS.COMMAND,
		target: firstOf("shell_id"),
	},
	Glob: {
		verb: "find_files",
		icon: ICONS.SEARCH,
		target: firstOf("pattern"),
		isReadOnly: true,
	},
	Grep: {
		verb: "search_code",
		icon: ICONS.SEARCH,
		target: quoted("pattern"),
		isReadOnly: true,
	},
	LS: {
		verb: "list_folder",
		icon: ICONS.FOLDER,
		target: firstOf("path"),
		isReadOnly: true,
	},
	WebFetch: { verb: "fetch_url", icon: ICONS.WEB, target: hostOf("url") },
	WebSearch: {
		verb: "search_web",
		icon: ICONS.WEB,
		target: quoted("query"),
		isReadOnly: true,
	},
	TodoWrite: {
		verb: "update_steps",
		icon: ICONS.STEPS,
		target: countOf("todos"),
		isReadOnly: true,
	},
	Task: {
		verb: "delegate",
		icon: ICONS.DELEGATE,
		target: firstOf("description"),
	},
	Agent: {
		verb: "delegate",
		icon: ICONS.DELEGATE,
		target: firstOf("description"),
	},
	ExitPlanMode: {
		verb: "propose_plan",
		icon: ICONS.PLAN,
		target: none,
		isReadOnly: true,
	},
	AskUserQuestion: {
		verb: "ask_you",
		icon: ICONS.ASK,
		target: countOf("questions"),
		isReadOnly: true,
	},
	Skill: {
		verb: "use_skill",
		icon: ICONS.SKILL,
		target: firstOf("skill", "command"),
		isReadOnly: true,
	},
	SlashCommand: {
		verb: "run_slash_command",
		icon: ICONS.SKILL,
		target: firstOf("command"),
	},
	ToolSearch: {
		verb: "search_tools",
		icon: ICONS.SEARCH,
		target: toolQuery,
		isReadOnly: true,
	},
};

const ASSISTANT_TOOLS: Record<string, ToolLexiconEntry> = {
	GetCurrentPage: {
		verb: "read_current_page",
		icon: ICONS.BROWSER,
		target: none,
		isReadOnly: true,
	},
	NavigateToPage: {
		verb: "open_page",
		icon: ICONS.OPEN,
		target: firstOf("path"),
		isReadOnly: true,
	},
	FindPagesUsing: {
		verb: "find_pages",
		icon: ICONS.SEARCH,
		target: firstOf("component", "query", "name"),
		isReadOnly: true,
	},
	ListPages: {
		verb: "list_pages",
		icon: ICONS.PAGE,
		target: none,
		isReadOnly: true,
	},
	AskUser: {
		verb: "ask_you",
		icon: ICONS.ASK,
		target: countOf("questions"),
		isReadOnly: true,
	},
	PreviewBlocks: {
		verb: "show_preview",
		icon: ICONS.PREVIEW,
		target: firstOf("title"),
		isReadOnly: true,
	},
	Typecheck: {
		verb: "typecheck",
		icon: ICONS.CHECK,
		target: none,
		isReadOnly: true,
	},
	QueryLogs: {
		verb: "read_logs",
		icon: ICONS.LOGS,
		target: firstOf("query", "search", "level"),
		isReadOnly: true,
	},
	DatabaseConnections: {
		verb: "list_databases",
		icon: ICONS.DATA,
		target: none,
		isReadOnly: true,
	},
	DatabaseRelations: {
		verb: "list_relations",
		icon: ICONS.DATA,
		target: firstOf("connection"),
		isReadOnly: true,
	},
	DatabaseDescribe: {
		verb: "describe_relations",
		icon: ICONS.TABLE,
		target: countOf("relations"),
		isReadOnly: true,
	},
	DatabaseProfile: {
		verb: "profile_relation",
		icon: ICONS.TABLE,
		target: firstOf("relation", "connection"),
		isReadOnly: true,
	},
};

const BUILDER_TOOLS: Record<string, ToolLexiconEntry> = {
	BuilderCatalog: {
		verb: "browse_blocks",
		icon: ICONS.BLOCK,
		target: none,
		isReadOnly: true,
	},
	BuilderListPages: {
		verb: "list_pages",
		icon: ICONS.PAGE,
		target: none,
		isReadOnly: true,
	},
	BuilderPageStructure: {
		verb: "read_page",
		icon: ICONS.PAGE,
		target: firstOf("pageRef"),
		isReadOnly: true,
	},
	BuilderCreatePage: {
		verb: "create_page",
		icon: ICONS.CREATE_PAGE,
		target: firstOf("displayName", "name"),
	},
	BuilderConfigurePage: {
		verb: "configure_page",
		icon: ICONS.PAGE,
		target: firstOf("pageRef"),
	},
	BuilderDeletePage: {
		verb: "delete_page",
		icon: ICONS.DELETE,
		target: firstOf("pageRef"),
	},
	BuilderAddBlock: {
		verb: "add_block",
		icon: ICONS.BLOCK,
		target: joined(firstOf("name"), firstOf("type")),
	},
	BuilderConfigureBlock: {
		verb: "configure_block",
		icon: ICONS.BLOCK,
		target: firstOf("path"),
	},
	BuilderMoveBlock: {
		verb: "move_block",
		icon: ICONS.BLOCK,
		target: firstOf("path"),
	},
	BuilderRemoveBlock: {
		verb: "remove_block",
		icon: ICONS.BLOCK,
		target: firstOf("path"),
	},
	BuilderCreateCategory: {
		verb: "create_category",
		icon: ICONS.CATEGORY,
		target: firstOf("displayName", "name"),
	},
	BuilderConfigureCategory: {
		verb: "configure_category",
		icon: ICONS.CATEGORY,
		target: firstOf("ref"),
	},
	BuilderDeleteCategory: {
		verb: "delete_category",
		icon: ICONS.DELETE,
		target: firstOf("ref"),
	},
	BuilderRefresh: {
		verb: "refresh_builder",
		icon: ICONS.REFRESH,
		target: firstOf("pageRef"),
		isReadOnly: true,
	},
	BuilderListResources: {
		verb: "list_tables",
		icon: ICONS.TABLE,
		target: none,
		isReadOnly: true,
	},
	BuilderResourceStructure: {
		verb: "read_table",
		icon: ICONS.TABLE,
		target: firstOf("ref"),
		isReadOnly: true,
	},
	BuilderConfigureProject: {
		verb: "configure_project",
		icon: ICONS.DATA,
		target: countOf("steps"),
	},
	BuilderMapResources: {
		verb: "map_tables",
		icon: ICONS.TABLE,
		target: firstOf("connection", "module"),
	},
	BuilderMapping: {
		verb: "read_mapping",
		icon: ICONS.TABLE,
		target: firstOf("connection", "module"),
		isReadOnly: true,
	},
	BuilderAnalyseDatabase: {
		verb: "analyse_database",
		icon: ICONS.TABLE,
		target: firstOf("connection", "job"),
		isReadOnly: true,
	},
	BuilderCreateResource: {
		verb: "create_table",
		icon: ICONS.TABLE,
		target: firstOf("displayName", "name"),
	},
	BuilderDeleteResource: {
		verb: "delete_table",
		icon: ICONS.DELETE,
		target: firstOf("ref"),
	},
	BuilderAddField: {
		verb: "add_field",
		icon: ICONS.FIELD,
		target: joined(firstOf("ref"), nested("field", "name")),
	},
	BuilderConfigureField: {
		verb: "configure_field",
		icon: ICONS.FIELD,
		target: firstOf("path"),
	},
	BuilderRemoveField: {
		verb: "remove_field",
		icon: ICONS.FIELD,
		target: firstOf("path"),
	},
	BuilderQueryTemplates: {
		verb: "browse_queries",
		icon: ICONS.DATA,
		target: firstOf("resourceType"),
		isReadOnly: true,
	},
	BuilderAddQuery: {
		verb: "add_query",
		icon: ICONS.DATA,
		target: firstOf("name"),
	},
	BuilderConfigureQuery: {
		verb: "configure_query",
		icon: ICONS.DATA,
		target: firstOf("path", "name"),
	},
	BuilderRemoveQuery: {
		verb: "remove_query",
		icon: ICONS.DATA,
		target: firstOf("path", "name"),
	},
};

const LEXICON: Record<string, ToolLexiconEntry> = {
	...CLAUDE_TOOLS,
	...ASSISTANT_TOOLS,
	...BUILDER_TOOLS,
};

/** Every verb key the lexicon uses, so the locale files can be checked. */
export const TOOL_VERB_KEYS: readonly string[] = [
	...new Set(Object.values(LEXICON).map((entry) => entry.verb)),
];

/** The tool's own name, without the `mcp__<server>__` an MCP tool carries. */
export function bareToolName(toolName: string): string {
	return toolName.replace(MCP_PREFIX, "");
}

/** "BuilderAddBlock" → "Builder add block", for a tool the lexicon lacks. */
export function readableToolName(toolName: string): string {
	const words = bareToolName(toolName)
		.replace(WORD_BOUNDARY, "$1 $2")
		.replace(SEPARATORS, " ")
		.trim()
		.toLowerCase();
	if (words === "") return toolName;
	return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function asRecord(args: unknown): Record<string, unknown> {
	if (args === null || typeof args !== "object" || Array.isArray(args))
		return {};
	return args as Record<string, unknown>;
}

function shorten(value: string): string {
	const oneLine = value.replace(/\s+/g, " ").trim();
	if (oneLine.length <= MAX_TARGET_CHARS) return oneLine;
	return `${oneLine.slice(0, MAX_TARGET_CHARS - ELLIPSIS.length)}${ELLIPSIS}`;
}

const GENERIC_TARGET = firstOf(
	"file_path",
	"path",
	"pageRef",
	"ref",
	"name",
	"command",
	"url",
	"query",
	"pattern",
);

/** What a call does and to what, in the lexicon's words. */
export function describeTool(toolName: string, args: unknown): ToolDescription {
	const entry = LEXICON[bareToolName(toolName)];
	const record = asRecord(args);
	const target = shorten((entry?.target ?? GENERIC_TARGET)(record));
	return {
		verbKey: entry?.verb ?? null,
		fallbackVerb: readableToolName(toolName),
		icon: entry?.icon ?? DEFAULT_ICON,
		target,
		isReadOnly: entry?.isReadOnly === true,
	};
}

/** The verb of a call, translated, or the readable name of an unknown tool. */
export function toolVerb(
	description: ToolDescription,
	translate: (key: string) => string,
): string {
	if (description.verbKey === null) return description.fallbackVerb;
	return translate(`dms_ai.tools.${description.verbKey}`);
}

/** One argument of a call, as the expanded row lists it. */
export interface NamedArgument {
	name: string;
	value: string;
}

const MAX_ARGUMENT_CHARS = 240;

function formatArgument(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/** The call's arguments by name, each value on one readable line. */
export function namedArguments(args: unknown): NamedArgument[] {
	return Object.entries(asRecord(args)).map(([name, value]) => {
		const text = formatArgument(value);
		return {
			name,
			value:
				text.length > MAX_ARGUMENT_CHARS
					? `${text.slice(0, MAX_ARGUMENT_CHARS - ELLIPSIS.length)}${ELLIPSIS}`
					: text,
		};
	});
}
