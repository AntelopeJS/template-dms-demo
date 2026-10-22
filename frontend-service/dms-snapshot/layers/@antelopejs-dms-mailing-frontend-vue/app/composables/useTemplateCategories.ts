import { useLocalizedDefaults } from './useLocalizedDefaults'
import { useStoredCategories } from './useMailingReads'

/**
 * The tenant's template categories, named in the interface's language: one
 * read the components showing them share (a table's category cells, the
 * gallery), none when it failed.
 */
export function useTemplateCategories() {
	const localized = useLocalizedDefaults()
	const { data, error } = useStoredCategories()
	const categories = computed(() =>
		localized.categories(error.value ? [] : (data.value?.categories ?? [])),
	)
	return { categories }
}
