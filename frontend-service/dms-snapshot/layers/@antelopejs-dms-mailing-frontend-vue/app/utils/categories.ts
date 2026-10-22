import type { TemplateCategory } from '../types/mailing'

const ID_SEPARATOR = '-'

export function serializeCategories(categories: TemplateCategory[]): string {
	return JSON.stringify(categories)
}

/** The icons the categories editor offers ("Pick an icon"). */
export const CATEGORY_ICONS = [
	'i-ph-package',
	'i-ph-lock',
	'i-ph-user-circle',
	'i-ph-key',
	'i-ph-file-text',
	'i-ph-newspaper',
	'i-ph-sparkle',
	'i-ph-textbox',
	'i-ph-truck',
	'i-ph-shopping-cart',
	'i-ph-bell',
	'i-ph-megaphone',
	'i-ph-gift',
	'i-ph-users',
	'i-ph-calendar',
	'i-ph-chat-circle',
]

export const DEFAULT_CATEGORY_ICON = 'i-ph-folder'

const ICON_PREFIX = 'i-ph-'

/**
 * The icon a new category starts with: the first one of the picker no
 * category uses yet, so a new row never looks like an existing one.
 */
export function newCategoryIcon(categories: TemplateCategory[]): string {
	const used = new Set(categories.map((category) => category.icon))
	return CATEGORY_ICONS.find((icon) => !used.has(icon)) ?? DEFAULT_CATEGORY_ICON
}

/** The i18n key part naming an icon (`megaphone` for `i-ph-megaphone`). */
export function iconName(icon: string): string {
	return icon.startsWith(ICON_PREFIX)
		? icon.slice(ICON_PREFIX.length).replace(/-/g, '_')
		: icon
}

/**
 * A row of the categories editor. `isNew` rows were added in this edit: their
 * id follows the label until the form is saved, then stays fixed for good.
 */
export interface EditableCategory extends TemplateCategory {
	key: string
	isNew: boolean
}

const UNIQUE_SUFFIX_START = 2
const FALLBACK_ID_BASE = 'category'

/** `base`, or `base-2`, `base-3`… the first one `taken` does not hold. */
export function uniqueId(base: string, taken: Set<string>): string {
	if (!taken.has(base)) return base
	let suffix = UNIQUE_SUFFIX_START
	while (taken.has(`${base}${ID_SEPARATOR}${suffix}`)) suffix++
	return `${base}${ID_SEPARATOR}${suffix}`
}

/**
 * The categories an edit stores, one per row in its order: saved rows keep
 * their id, new rows get one derived from their label, unique among the
 * others. A row without a label is sent too, for the server to name it.
 */
export function toStoredCategories(
	rows: EditableCategory[],
): TemplateCategory[] {
	const taken = new Set(rows.filter((row) => !row.isNew).map((row) => row.id))
	return rows.map((row) => {
		const id = row.isNew
			? uniqueId(slugifyId(row.label) || FALLBACK_ID_BASE, taken)
			: row.id
		taken.add(id)
		return {
			id,
			label: row.label.trim(),
			icon: row.icon || DEFAULT_CATEGORY_ICON,
		}
	})
}

/**
 * A category as the editor hands it to the form: a kept one, or one removed
 * whose templates move to `moveTo` once the form is saved.
 */
export interface CategoryEntry extends TemplateCategory {
	moveTo?: string
}

/** The kept categories of a list, without the removed ones it moves away. */
export function keptCategories(entries: CategoryEntry[]): TemplateCategory[] {
	return entries.filter((entry) => entry.moveTo === undefined)
}

/** Where the templates of each removed category go, by its id. */
export function categoryMoves(entries: CategoryEntry[]): Map<string, string> {
	return new Map(
		entries.flatMap((entry) =>
			entry.moveTo === undefined ? [] : [[entry.id, entry.moveTo] as const],
		),
	)
}

/**
 * What the editor hands the form: the kept categories, then each removed one
 * whose templates move elsewhere, still under its own id.
 */
export function withMoves(
	categories: TemplateCategory[],
	removed: CategoryEntry[],
): CategoryEntry[] {
	return [...categories, ...removed.filter((entry) => entry.moveTo)]
}

/**
 * The moves of `removed` once `id` is removed too and its templates go to
 * `target`: a move into `id` follows it to `target`, or is dropped when
 * `target` is none (those templates end uncategorised either way).
 */
export function redirectMoves(
	removed: CategoryEntry[],
	id: string,
	target: string,
): CategoryEntry[] {
	return removed
		.map((entry) =>
			entry.moveTo === id ? { ...entry, moveTo: target } : entry,
		)
		.filter((entry) => entry.moveTo)
}

/** Rows after a move, and where the moved row now sits. */
export interface MovedRows<T> {
	rows: T[]
	index: number
}

/**
 * `rows` with the row at `index` moved by `offset` (-1 up, 1 down), and its
 * new index; unchanged at either end.
 */
export function moveRow<T>(
	rows: T[],
	index: number,
	offset: number,
): MovedRows<T> {
	const target = index + offset
	if (target < 0 || target >= rows.length) return { rows, index }
	const moved = [...rows]
	const [row] = moved.splice(index, 1)
	moved.splice(target, 0, row as T)
	return { rows: moved, index: target }
}

/**
 * The id a new category gets from its label. Ids are stored on every template,
 * so they stay ASCII and stable rather than following a later rename.
 */
export function slugifyId(label: string): string {
	return label
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ID_SEPARATOR)
		.replace(/^-+|-+$/g, '')
}

/**
 * `USelect` is backed by Reka's `Select`, which reserves the empty string for
 * "nothing selected". An item carrying it makes the listbox refuse to open at
 * all — silently, with no console error. "No category" therefore travels as
 * this sentinel inside the widget and is mapped back on the way out.
 */
export const NO_CATEGORY = '__none__'

export function toCategoryOption(value: string | null | undefined): string {
	return value || NO_CATEGORY
}

export function fromCategoryOption(value: string): string {
	return value === NO_CATEGORY ? '' : value
}

/**
 * The category an edit stores. "No category" is sent as `null` rather than
 * omitted: from interface-data-api 0.2.0 on, the edit route leaves an absent
 * key unchanged, so only an explicit `null` clears it.
 */
export function toStoredCategory(
	value: string | null | undefined,
): string | null {
	return value || null
}

/** Answers the text of an i18n key, or nothing when the catalog lacks it. */
export type OptionalTranslate = (key: string) => string | undefined

/** The labels the backend's `DEFAULT_CATEGORIES` (`src/types/settings.ts`) ship with. */
const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
	orders: 'Orders',
	account: 'Account & access',
	billing: 'Billing',
	marketing: 'Marketing',
	forms: 'Forms',
}
const DEFAULT_CATEGORY_KEY_PREFIX = 'dms_mailing.categories.defaults'

/** The i18n key of a shipped category nobody renamed; absent otherwise. */
export function defaultCategoryLabelKey(
	category: TemplateCategory,
): string | undefined {
	return DEFAULT_CATEGORY_LABELS[category.id] === category.label
		? `${DEFAULT_CATEGORY_KEY_PREFIX}.${category.id}`
		: undefined
}

/**
 * The categories as the interface shows them: a shipped one still under its
 * original English label reads in the interface's language, a label someone
 * wrote stays as written. Nothing stored changes.
 */
export function localizeCategories(
	categories: TemplateCategory[],
	translate: OptionalTranslate,
): TemplateCategory[] {
	return categories.map((category) => {
		const key = defaultCategoryLabelKey(category)
		const label = key ? translate(key) : undefined
		return label ? { ...category, label } : category
	})
}
