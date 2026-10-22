import type { ConversationSummary } from "../types/conversation";

type ConversationGroupKey = "active" | "today" | "week" | "older";

export interface ConversationGroup {
	key: ConversationGroupKey;
	items: ConversationSummary[];
}

const DAYS_IN_WEEK = 7;
const GROUP_ORDER: readonly ConversationGroupKey[] = [
	"active",
	"today",
	"week",
	"older",
];

/** Working, or waiting on the user: pinned on top so it never times out unseen. */
function isActiveConversation(item: ConversationSummary): boolean {
	return (
		item.isRunning === true ||
		(item.pendingApprovals ?? 0) > 0 ||
		(item.pendingQuestions ?? 0) > 0
	);
}

function startOfDay(ms: number): number {
	const date = new Date(ms);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

function startOfDaysAgo(nowMs: number, days: number): number {
	const date = new Date(startOfDay(nowMs));
	date.setDate(date.getDate() - days);
	return date.getTime();
}

function groupOf(
	item: ConversationSummary,
	nowMs: number,
): ConversationGroupKey {
	if (isActiveConversation(item)) return "active";
	if (item.updatedAtMs >= startOfDay(nowMs)) return "today";
	if (item.updatedAtMs >= startOfDaysAgo(nowMs, DAYS_IN_WEEK - 1))
		return "week";
	return "older";
}

function matches(item: ConversationSummary, search: string): boolean {
	const needle = search.trim().toLocaleLowerCase();
	if (needle === "") return true;
	return item.title.toLocaleLowerCase().includes(needle);
}

/**
 * The drawer's sections: Active pinned above Today, This week and Older,
 * newest first within each, filtered by the search, empty sections dropped.
 */
export function groupConversations(
	items: readonly ConversationSummary[],
	nowMs: number,
	search = "",
): ConversationGroup[] {
	const sorted = items
		.filter((item) => matches(item, search))
		.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
	return GROUP_ORDER.map((key) => ({
		key,
		items: sorted.filter((item) => groupOf(item, nowMs) === key),
	})).filter((group) => group.items.length > 0);
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** The drawer's time: now, minutes ago, a time today, a weekday, a date. */
export function conversationTime(
	timestampMs: number,
	nowMs: number,
	locale: string,
	nowLabel: string,
): string {
	const minutes = Math.floor((nowMs - timestampMs) / MS_PER_MINUTE);
	if (minutes < 1) return nowLabel;
	if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
	const date = new Date(timestampMs);
	if (timestampMs >= startOfDay(nowMs))
		return date.toLocaleTimeString(locale, {
			hour: "2-digit",
			minute: "2-digit",
		});
	if (timestampMs >= startOfDaysAgo(nowMs, DAYS_IN_WEEK - 1))
		return date.toLocaleDateString(locale, { weekday: "short" });
	return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
