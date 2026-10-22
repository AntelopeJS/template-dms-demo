/** Where a tool acts, as the Activity eyebrow names it. */
export type ToolSource = "builder" | "code" | "web" | "project" | "assistant";

const MCP_PREFIX = /^mcp__.+?__/;
const WORD_BOUNDARY = /([a-z0-9])([A-Z])|[_-]+/g;
const BUILDER_PREFIX = "Builder";

const CODE_TOOLS = new Set([
	"Bash",
	"Edit",
	"MultiEdit",
	"Write",
	"Read",
	"Glob",
	"Grep",
	"LS",
	"NotebookEdit",
	"command_execution",
	"file_change",
]);
const WEB_TOOLS = new Set(["WebFetch", "WebSearch", "web_search"]);
const PROJECT_TOOLS = new Set(["Typecheck", "NavigateToPage"]);

const SOURCE_ICONS: Record<ToolSource, string> = {
	builder: "i-ph-squares-four",
	code: "i-ph-terminal-window",
	web: "i-ph-globe",
	project: "i-ph-folder-simple",
	assistant: "i-ph-sparkle",
};

/** The tool's own name, without the `mcp__<server>__` namespace. */
export function bareToolName(tool: string): string {
	return tool.replace(MCP_PREFIX, "");
}

/** "BuilderAddBlock" → "Builder add block", for a tool the lexicon lacks. */
export function readableToolName(tool: string): string {
	const name = bareToolName(tool);
	const words = (
		name.startsWith(BUILDER_PREFIX) && name !== BUILDER_PREFIX
			? name.slice(BUILDER_PREFIX.length)
			: name
	)
		.replace(WORD_BOUNDARY, (_match, left?: string, right?: string) =>
			left === undefined ? " " : `${left} ${right}`,
		)
		.trim()
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

interface SourceRule {
	source: ToolSource;
	matches: (name: string) => boolean;
}

const SOURCE_RULES: SourceRule[] = [
	{ source: "builder", matches: (name) => name.startsWith(BUILDER_PREFIX) },
	{ source: "code", matches: (name) => CODE_TOOLS.has(name) },
	{ source: "web", matches: (name) => WEB_TOOLS.has(name) },
	{ source: "project", matches: (name) => PROJECT_TOOLS.has(name) },
];

export function toolSource(tool: string): ToolSource {
	const name = bareToolName(tool);
	const rule = SOURCE_RULES.find((candidate) => candidate.matches(name));
	return rule?.source ?? "assistant";
}

export function toolIcon(tool: string): string {
	return SOURCE_ICONS[toolSource(tool)];
}
