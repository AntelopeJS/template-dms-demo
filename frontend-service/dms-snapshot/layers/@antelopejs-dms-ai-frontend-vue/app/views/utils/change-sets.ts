import { CHANGE_SET_QUERY_KEY } from "../constants";
import type { ChangeSetSummary } from "../types";

const UNDONE_ICON = "i-ph-arrow-counter-clockwise";
const AUTO_FIX_ICON = "i-ph-wrench";
const SCOPE_NODE_ICONS: Record<ChangeSetSummary["scope"], string> = {
	safe: "i-ph-sparkle",
	vibe: "i-ph-code",
};

/** The list node of a set: undone, auto-fix, else its scope. */
export function changeSetIcon(changeSet: ChangeSetSummary): string {
	if (changeSet.state === "undone") return UNDONE_ICON;
	if (changeSet.isAutoFix) return AUTO_FIX_ICON;
	return SCOPE_NODE_ICONS[changeSet.scope];
}

/** The set's title or one of its files contains the search, case aside. */
export function matchesSearch(
	changeSet: ChangeSetSummary,
	search: string,
): boolean {
	const needle = search.trim().toLowerCase();
	if (needle === "") return true;
	const haystack = [changeSet.title, ...changeSet.files.map((f) => f.path)];
	return haystack.some((text) => text.toLowerCase().includes(needle));
}

/**
 * Keeps the selected set in the URL without a visit, so a reload or a shared
 * link opens it again.
 */
export function writeSelectedSet(changeSetId: string): void {
	const url = new URL(window.location.href);
	url.searchParams.set(CHANGE_SET_QUERY_KEY, changeSetId);
	window.history.replaceState(window.history.state, "", url);
}
