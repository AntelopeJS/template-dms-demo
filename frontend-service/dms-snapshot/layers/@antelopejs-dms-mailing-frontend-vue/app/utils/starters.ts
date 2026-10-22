import type { StarterSummary } from '../types/mailing'
import type { OptionalTranslate } from './categories'

const STARTER_NAME_KEY_PREFIX = 'dms_mailing.starters.names'

/** The i18n key naming a shipped starter ("Order confirmation"). */
export function starterNameKey(id: string): string {
	return `${STARTER_NAME_KEY_PREFIX}.${id}`
}

/**
 * The starters named in the interface's language; one the catalog does not
 * know keeps the name the backend gives it.
 */
export function localizeStarters(
	starters: StarterSummary[],
	translate: OptionalTranslate,
): StarterSummary[] {
	return starters.map((starter) => ({
		...starter,
		name: translate(starterNameKey(starter.id)) ?? starter.name,
	}))
}
