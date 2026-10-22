import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_VERB_KEYS } from "../app/chat/utils/tool-lexicon";
import en from "../i18n/locales/dms-ai-panel-en-GB.json";
import fr from "../i18n/locales/dms-ai-panel-fr-FR.json";

type Tree = Record<string, unknown>;

const ROOT = resolve(__dirname, "..");
const SOURCES = [
	"app/chat",
	"app/runtime",
	"app/plugins",
	"app/components/ChatPanel.vue",
];
const LITERAL_KEY =
	/["'`](dms_ai\.(?:panel|tools|common)\.[A-Za-z0-9_.]+[A-Za-z0-9_])["'`]/g;
const OWNED_NAMESPACES = ["panel", "tools", "common"];

/** Keys built at run time from a value, each with every value it can take. */
const DYNAMIC_FAMILIES: Record<string, readonly string[]> = {
	"dms_ai.panel.tool.state": [
		"done",
		"running",
		"waiting",
		"denied",
		"blocked",
		"failed",
		"stopped",
	],
	"dms_ai.panel.change.status": ["added", "modified", "deleted"],
	"dms_ai.panel.change.typecheck": ["passed", "failed", "skipped"],
	"dms_ai.common.scope": ["safe", "vibe"],
	"dms_ai.common.agent": ["claude", "codex"],
	"dms_ai.panel.composer.scope_desc": ["safe", "vibe"],
	"dms_ai.panel.full_auto": [
		"duration_turn",
		"duration_30m",
		"duration_chat",
		"banner_turn",
		"banner_30m",
		"banner_chat",
	],
	"dms_ai.panel.drawer": [
		"group_active",
		"group_today",
		"group_week",
		"group_older",
	],
	"dms_ai.panel.empty": ["text_safe", "text_vibe"],
	"dms_ai.panel.approvals": [
		"why_deletes_data",
		"why_removes_code",
		"effect_adds_dependency",
		"effect_removes_dependency",
	],
	"dms_ai.panel.rules": [
		"kind_file",
		"kind_directory",
		"kind_command",
		"kind_domain",
	],
};

function files(path: string): string[] {
	const full = join(ROOT, path);
	if (!statSync(full).isDirectory()) return [full];
	return readdirSync(full).flatMap((entry) => files(join(path, entry)));
}

function flatten(tree: Tree, prefix = ""): string[] {
	return Object.entries(tree).flatMap(([key, value]) =>
		value !== null && typeof value === "object"
			? flatten(value as Tree, `${prefix}${key}.`)
			: [`${prefix}${key}`],
	);
}

function usedKeys(): string[] {
	const source = SOURCES.flatMap(files)
		.map((file) => readFileSync(file, "utf8"))
		.join("\n");
	return [
		...new Set([...source.matchAll(LITERAL_KEY)].map((match) => match[1])),
	];
}

const dynamicKeys = Object.entries(DYNAMIC_FAMILIES).flatMap(
	([prefix, values]) => values.map((value) => `${prefix}.${value}`),
);

describe("the panel's strings", () => {
	const english = new Set(flatten(en));
	const french = new Set(flatten(fr));

	it("exist in English and French alike", () => {
		expect([...english].sort()).toEqual([...french].sort());
	});

	it("cover every key the panel uses", () => {
		const keys = [
			...usedKeys(),
			...dynamicKeys,
			...TOOL_VERB_KEYS.map((verb) => `dms_ai.tools.${verb}`),
		];
		expect(keys.filter((key) => !english.has(key))).toEqual([]);
	});

	it("stay in the panel's own namespaces", () => {
		expect(Object.keys(en.dms_ai).sort()).toEqual([...OWNED_NAMESPACES].sort());
	});

	it("hold no character vue-i18n would read as syntax", () => {
		const texts = [JSON.stringify(en), JSON.stringify(fr)];
		for (const text of texts) expect(text).not.toMatch(/[@$]/);
	});
});
