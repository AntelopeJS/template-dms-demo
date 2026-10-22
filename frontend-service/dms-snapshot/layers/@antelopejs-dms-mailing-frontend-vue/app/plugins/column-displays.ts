import { h, type VNode } from 'vue'
import CategoryLabel from '../components/CategoryLabel.vue'
import { localeChipClass, localeChips } from '../utils/locales'

export const LOCALE_CHIPS_DISPLAY_ID = 'mailing:locale-chips'
export const CATEGORY_DISPLAY_ID = 'mailing:category'

const EMPTY_CELL = '—'
const CHIP_ROW_CLASS = 'inline-flex items-center gap-1'

interface WorkspaceLocale {
	code: string
}

const emptyCell = () => h('span', { class: 'text-dimmed' }, EMPTY_CELL)

/**
 * A template's locales as mono chips, the workspace locales it lacks drawn
 * dashed in the warning tone, like the gallery card.
 */
export function renderLocaleChips(
	value: unknown,
	workspaceCodes: string[],
): VNode {
	const chips = localeChips(
		typeof value === 'string' ? value : '',
		workspaceCodes,
	)
	if (!chips.length) return emptyCell()
	return h(
		'span',
		{ class: CHIP_ROW_CLASS },
		chips.map((chip) =>
			h('span', { class: localeChipClass(chip.present) }, chip.code),
		),
	)
}

/** A template's category as its settings label and icon. */
export function renderCategory(value: unknown): VNode {
	return h(CategoryLabel, { value: typeof value === 'string' ? value : null })
}

function workspaceCodes(): string[] {
	const { uniqueLocales } = useUniqueLocales()
	return uniqueLocales.value.map((entry: WorkspaceLocale) => entry.code)
}

/**
 * Frontend renderers of the backend column displays `mailing:locale-chips`
 * and `mailing:category` (`src/data/displays.ts`).
 */
export default defineDmsPlugin(() => {
	const { registerDataType } = useDataTypes()
	registerDataType({
		id: LOCALE_CHIPS_DISPLAY_ID,
		formatter: {
			default: (value: unknown) => renderLocaleChips(value, workspaceCodes()),
		},
	})
	registerDataType({
		id: CATEGORY_DISPLAY_ID,
		formatter: { default: renderCategory },
	})
})
