export interface LocalePresence {
	code: string
	present: boolean
}

const LOCALE_LIST_SEPARATOR = ','

/** Base look of a locale chip, on a card, in a table cell or a review box. */
export const LOCALE_CHIP_CLASS =
	'inline-flex h-[18px] items-center rounded px-1.5 font-mono text-[10.5px] font-semibold uppercase leading-none'

/** A locale the template carries. */
export const LOCALE_CHIP_PRESENT_CLASS = 'bg-elevated text-toned'

/** A workspace locale the template lacks: its recipients get the fallback. */
export const LOCALE_CHIP_MISSING_CLASS =
	'text-warning border-warning/60 border border-dashed'

/** Reads the `locales` column, whose format is a comma-separated code list. */
export function parseLocaleList(value: string | undefined | null): string[] {
	return (value ?? '')
		.split(LOCALE_LIST_SEPARATOR)
		.map((code) => code.trim())
		.filter(Boolean)
}

/**
 * Coverage of `codes` (the locales the tenant offers, in its own order) by
 * `present` (the locales something actually has).
 */
export function localeCoverage(
	present: string[],
	codes: string[],
): LocalePresence[] {
	const owned = new Set(present)
	return codes.map((code) => ({ code, present: owned.has(code) }))
}

/**
 * Badge list for a template row. A row written before the `locales` column
 * existed carries no information, which is not the same as "no locale": it
 * answers an empty list so the card shows nothing rather than claiming every
 * locale is missing.
 */
export function localeBadges(
	stored: string | undefined | null,
	codes: string[],
): LocalePresence[] {
	const present = parseLocaleList(stored)
	if (!present.length) return []
	return localeCoverage(present, codes)
}

/**
 * Chips for a list of codes: the workspace ones in the workspace order, then
 * any the template carries that the workspace no longer offers.
 */
export function localeChips(
	stored: string | undefined | null,
	codes: string[],
): LocalePresence[] {
	const present = parseLocaleList(stored)
	if (!present.length) return []
	const extra = present.filter((code) => !codes.includes(code))
	return [
		...localeCoverage(present, codes),
		...extra.map((code) => ({ code, present: true })),
	]
}

/** The workspace locales `present` lacks. */
export function missingLocales(present: string[], codes: string[]): string[] {
	return localeCoverage(present, codes)
		.filter((entry) => !entry.present)
		.map((entry) => entry.code)
}

export function localeChipClass(present: boolean): string {
	return `${LOCALE_CHIP_CLASS} ${present ? LOCALE_CHIP_PRESENT_CLASS : LOCALE_CHIP_MISSING_CLASS}`
}

const DEFAULT_FALLBACK_LOCALE = 'en'
const LOCALE_PART_SEPARATOR = /[-_]/

/** The base language of a locale code: "fr-BE" and "FR" both read "fr". */
export function localeLanguage(code: string): string {
	const [language = code] = code.split(LOCALE_PART_SEPARATOR)
	return language.toLowerCase()
}

/**
 * The locale a send renders, as the server picks it: the requested one
 * (regardless of case, or by its base language), else the tenant fallback,
 * else English, else the first locale the content carries.
 */
export function pickLocale(
	available: string[],
	wanted: string | undefined,
	fallback: string,
): string {
	const byCode = new Map(available.map((code) => [code.toLowerCase(), code]))
	const requested = wanted ? [wanted, localeLanguage(wanted)] : []
	const candidates = [
		...requested,
		fallback,
		DEFAULT_FALLBACK_LOCALE,
		available[0],
	]
	const match = candidates
		.map((code) => (code ? byCode.get(code.toLowerCase()) : undefined))
		.find((code): code is string => Boolean(code))
	return match ?? DEFAULT_FALLBACK_LOCALE
}

const LANGUAGE_NAMES: Intl.DisplayNamesOptions = { type: 'language' }

/**
 * A language named in the interface's language, capitalised like a label
 * ("Anglais" for `en` in French); absent when the runtime does not know it.
 */
export function languageName(
	code: string,
	uiLocale: string,
): string | undefined {
	try {
		const name = new Intl.DisplayNames([uiLocale], LANGUAGE_NAMES).of(code)
		if (!name || name.toLowerCase() === code.toLowerCase()) return undefined
		return name.charAt(0).toLocaleUpperCase(uiLocale) + name.slice(1)
	} catch {
		return undefined
	}
}

/**
 * A locale as a picker lists it, in the interface's language: "French (FR)".
 * `fallbackName` stands in for a language the runtime cannot name.
 */
export function languageLabel(
	code: string,
	uiLocale: string,
	fallbackName?: string,
): string {
	const upper = code.toUpperCase()
	const name = languageName(code, uiLocale) ?? fallbackName
	return name ? `${name} (${upper})` : upper
}
