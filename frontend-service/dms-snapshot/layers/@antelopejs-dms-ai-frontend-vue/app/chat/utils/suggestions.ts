import type { CurrentPage } from "../types/conversation";

/** A first request the empty chat offers, about the page on screen. */
export interface PageSuggestion {
	icon: string;
	/** Translation key; takes the page name as `page`. */
	textKey: string;
	isReadOnly: boolean;
}

const TITLE_SEPARATORS = /\s+[·|–—-]\s+/;
const PATH_SEPARATOR = "/";
const WORD_SEPARATORS = /[-_]+/g;
const HOME_PATHS: ReadonlySet<string> = new Set(["", "/", "/home"]);
const MODULE_PAGE = /^\/modules\/[^/]+/;

const PAGE_SUGGESTIONS: readonly PageSuggestion[] = [
	{
		icon: "i-ph-squares-four",
		textKey: "dms_ai.panel.empty.suggest.add_chart",
		isReadOnly: false,
	},
	{
		icon: "i-ph-funnel",
		textKey: "dms_ai.panel.empty.suggest.add_filter",
		isReadOnly: false,
	},
	{
		icon: "i-ph-question",
		textKey: "dms_ai.panel.empty.suggest.explain",
		isReadOnly: true,
	},
];

const HOME_SUGGESTIONS: readonly PageSuggestion[] = [
	{
		icon: "i-ph-folder-simple-plus",
		textKey: "dms_ai.panel.empty.suggest.create_page",
		isReadOnly: false,
	},
	{
		icon: "i-ph-table",
		textKey: "dms_ai.panel.empty.suggest.create_table",
		isReadOnly: false,
	},
	{
		icon: "i-ph-question",
		textKey: "dms_ai.panel.empty.suggest.explain_project",
		isReadOnly: true,
	},
];

const MODULE_SUGGESTIONS: readonly PageSuggestion[] = [
	{
		icon: "i-ph-squares-four",
		textKey: "dms_ai.panel.empty.suggest.add_block",
		isReadOnly: false,
	},
	{
		icon: "i-ph-pencil-simple-line",
		textKey: "dms_ai.panel.empty.suggest.rename",
		isReadOnly: false,
	},
	{
		icon: "i-ph-question",
		textKey: "dms_ai.panel.empty.suggest.explain",
		isReadOnly: true,
	},
];

function humanize(segment: string): string {
	const words = decodeURIComponent(segment)
		.replace(WORD_SEPARATORS, " ")
		.trim();
	return words === ""
		? ""
		: `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** The page's name: its title without the site suffix, else its last path segment. */
export function pageName(page: CurrentPage | null): string {
	const title = page?.title?.split(TITLE_SEPARATORS)[0]?.trim() ?? "";
	if (title !== "") return title;
	const segments = (page?.path ?? "").split(PATH_SEPARATOR).filter(Boolean);
	return humanize(segments.at(-1) ?? "");
}

/** The page's path as the chip shows it, without the leading slash. */
export function pageChipLabel(page: CurrentPage | null): string {
	return (page?.path ?? "").replace(/^\/+/, "");
}

/** Three first requests that fit the page: home, a module page, or any other. */
export function pageSuggestions(
	page: CurrentPage | null,
): readonly PageSuggestion[] {
	const path = page?.path ?? "";
	if (HOME_PATHS.has(path)) return HOME_SUGGESTIONS;
	if (MODULE_PAGE.test(path)) return MODULE_SUGGESTIONS;
	return PAGE_SUGGESTIONS;
}
