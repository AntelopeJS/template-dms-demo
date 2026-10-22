import type { TemplateCategory } from '../types/mailing'

export interface CategoryGroup<T> {
	category: TemplateCategory
	items: T[]
}

export interface CategorizedRow {
	category?: string | null
}

export const UNCATEGORISED_GROUP_ID = 'uncategorised'

const UNCATEGORISED_ICON = 'i-ph-folder-dashed'

/**
 * Groups template rows by the categories declared in the settings, keeping the
 * declared order. Rows with no category, or one the settings no longer declare,
 * land in a trailing group the caller labels — it is the only heading here that
 * needs translating. Empty groups are dropped.
 */
export function groupByCategory<T extends CategorizedRow>(
	rows: T[],
	categories: TemplateCategory[],
	uncategorisedLabel: string,
): CategoryGroup<T>[] {
	const known = categories.map((category) => ({
		category,
		items: rows.filter((row) => row.category === category.id),
	}))
	const knownIds = new Set(categories.map((category) => category.id))
	const uncategorised = {
		category: {
			id: UNCATEGORISED_GROUP_ID,
			label: uncategorisedLabel,
			icon: UNCATEGORISED_ICON,
		},
		items: rows.filter((row) => !row.category || !knownIds.has(row.category)),
	}
	return [...known, uncategorised].filter((group) => group.items.length > 0)
}

/** The slice of the DMS `TableViewDisplayPagination` the gallery reads. */
export interface GalleryPagination {
	pageIndex: number
	pageSize: number
	total: number
	setPage: (index: number) => void
	mode?: string
	hasMore?: boolean
	loadMore?: () => void
}

/** The slice of the DMS `TableViewDisplayActions` the gallery reads. */
export interface GalleryActions<T> {
	open: (item: T) => void
}

/** The slice of the TanStack table the gallery reaches for its reset. */
export interface GalleryTable {
	setGlobalFilter: (value: string) => void
}

/**
 * The slice of the DMS `TableViewDisplayContext` the gallery display reads,
 * declared structurally: the layer does not import from the dms-ui layer.
 */
export interface GalleryContext<T> {
	items: T[]
	loading: boolean
	pagination: GalleryPagination
	actions?: GalleryActions<T>
	/** Active filters, search and sort of the table, without paging. */
	query?: Record<string, unknown>
	refresh: () => Promise<void> | void
	table?: GalleryTable
}

const SEARCH_KEY = 'search'
const FILTER_PREFIX = 'filter_'
/** The "Needs attention" tab filters on this column. */
const ATTENTION_FILTER_KEY = `${FILTER_PREFIX}needsAttention`
/** The tabs filter on these columns: a tab is not a user filter. */
const TAB_FILTER_KEYS = new Set([
	`${FILTER_PREFIX}status`,
	ATTENTION_FILTER_KEY,
])

/** The search typed in the table, trimmed; empty without one. */
export function searchTermOf(
	query: Record<string, unknown> | undefined,
): string {
	const value = query?.[SEARCH_KEY]
	return typeof value === 'string' ? value.trim() : ''
}

/** The filters the user set (quick filters, filter rows), not the tab. */
export function userFilterKeys(
	query: Record<string, unknown> | undefined,
): string[] {
	return Object.keys(query ?? {}).filter(
		(key) => key.startsWith(FILTER_PREFIX) && !TAB_FILTER_KEYS.has(key),
	)
}

/** Whether the table shows its "Needs attention" tab. */
export function isAttentionView(
	query: Record<string, unknown> | undefined,
): boolean {
	return ATTENTION_FILTER_KEY in (query ?? {})
}

/** Whether a search or a filter narrows what the gallery lists. */
export function isNarrowed(
	query: Record<string, unknown> | undefined,
): boolean {
	return Boolean(searchTermOf(query)) || userFilterKeys(query).length > 0
}

/** Whether `row` holds `search`, whatever its case, in one of `fields`. */
export function matchesSearch(
	row: object,
	search: string,
	fields: string[],
): boolean {
	const term = search.trim().toLowerCase()
	const cellOf = (field: string) =>
		String((row as Record<string, unknown>)[field] ?? '').toLowerCase()
	return !term || fields.some((field) => cellOf(field).includes(term))
}

const SORT_KEY = 'sortKey'

/** The table's sort column; absent without one. */
export function sortKeyOf(
	query: Record<string, unknown> | undefined,
): string | undefined {
	const key = query?.[SORT_KEY]
	return typeof key === 'string' && key ? key : undefined
}

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000
const HOURS_PER_DAY = 24

/** Words a sentence puts around an absolute date ("le 27 sept." in French). */
export type OnDate = (date: string) => string

const bareDate: OnDate = (date) => date

/** How a card writes a date more than a day old ("Sep 27"). */
export const CARD_DATE_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: '2-digit',
}

/**
 * A date as a card reads it: "2 hr. ago" / "5 min. ago" within a day, "Sep 27"
 * after. `onDate` dresses the absolute one only, so a sentence written around
 * it ("Edited {date}") reads right in both cases. Empty for an unreadable date.
 * `dateFormat` writes the absolute one: a component passes the DMS's regional
 * one (`useRegionalFormat().dateTimeFormat(CARD_DATE_FORMAT)`), whose day is
 * the reader's, on a server render too.
 */
export function formatCardDate(
	date: string | null | undefined,
	now: Date,
	locale: string,
	onDate: OnDate = bareDate,
	dateFormat: Intl.DateTimeFormat = new Intl.DateTimeFormat(
		locale,
		CARD_DATE_FORMAT,
	),
): string {
	const time = date ? new Date(date).getTime() : Number.NaN
	if (Number.isNaN(time)) return ''
	const elapsed = Math.max(0, now.getTime() - time)
	const relative = new Intl.RelativeTimeFormat(locale, {
		numeric: 'auto',
		style: 'short',
	})
	if (elapsed < MS_PER_HOUR) {
		return relative.format(-Math.round(elapsed / MS_PER_MINUTE), 'minute')
	}
	if (elapsed < HOURS_PER_DAY * MS_PER_HOUR) {
		return relative.format(-Math.round(elapsed / MS_PER_HOUR), 'hour')
	}
	return onDate(dateFormat.format(new Date(time)))
}

/**
 * How long ago `date` was, the way "live since…" reads it: a duration within a
 * day ("1 hr", "5 min"; "1 h" in French), the date after ("Sep 27"). `null`
 * for an unreadable date.
 */
export interface CardSince {
	kind: 'duration' | 'date'
	text: string
}

export function formatCardSince(
	date: string | null | undefined,
	now: Date,
	locale: string,
	dateFormat?: Intl.DateTimeFormat,
): CardSince | null {
	const time = date ? new Date(date).getTime() : Number.NaN
	if (Number.isNaN(time)) return null
	const elapsed = Math.max(0, now.getTime() - time)
	if (elapsed >= HOURS_PER_DAY * MS_PER_HOUR)
		return {
			kind: 'date',
			text: formatCardDate(date, now, locale, undefined, dateFormat),
		}
	const isHours = elapsed >= MS_PER_HOUR
	const amount = Math.max(
		1,
		Math.round(elapsed / (isHours ? MS_PER_HOUR : MS_PER_MINUTE)),
	)
	const text = new Intl.NumberFormat(locale, {
		style: 'unit',
		unit: isHours ? 'hour' : 'minute',
		unitDisplay: 'short',
	}).format(amount)
	return { kind: 'duration', text }
}

/** The first word of a person's name ("Hugo Bernard" → "Hugo"). */
export function firstName(fullName: string | null | undefined): string {
	return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}
