import type { StarterSummary, TemplateCategory } from '../types/mailing'
import { localizeCategories, type OptionalTranslate } from '../utils/categories'
import { localizeStarters } from '../utils/starters'

/**
 * What the module ships by default (starters, the first categories) named in
 * the interface's language, without touching what is stored.
 */
export function useLocalizedDefaults() {
	const { t, te } = useI18n()
	const translate: OptionalTranslate = (key) => (te(key) ? t(key) : undefined)
	return {
		categories: (list: TemplateCategory[]) =>
			localizeCategories(list, translate),
		starters: (list: StarterSummary[]) => localizeStarters(list, translate),
	}
}
