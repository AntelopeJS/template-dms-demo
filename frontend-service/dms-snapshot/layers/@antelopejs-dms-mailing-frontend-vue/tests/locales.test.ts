import { describe, expect, it } from 'vitest'
import {
	LOCALE_CHIP_MISSING_CLASS,
	localeBadges,
	localeChipClass,
	localeChips,
	localeCoverage,
	localeLanguage,
	missingLocales,
	parseLocaleList,
	pickLocale,
	languageLabel,
	languageName,
} from '../app/utils/locales'

describe('parseLocaleList', () => {
	it('splits the stored list and drops blanks', () => {
		expect(parseLocaleList('en,fr')).toEqual(['en', 'fr'])
		expect(parseLocaleList(' en , fr ')).toEqual(['en', 'fr'])
		expect(parseLocaleList('')).toEqual([])
		expect(parseLocaleList(undefined)).toEqual([])
		expect(parseLocaleList(null)).toEqual([])
	})
})

describe('localeCoverage', () => {
	it('flags locales missing from the present set, in the tenant order', () => {
		expect(localeCoverage(['fr'], ['en', 'fr'])).toEqual([
			{ code: 'en', present: false },
			{ code: 'fr', present: true },
		])
	})
})

describe('localeBadges', () => {
	it('reports coverage against the tenant locales', () => {
		expect(localeBadges('en', ['en', 'fr'])).toEqual([
			{ code: 'en', present: true },
			{ code: 'fr', present: false },
		])
	})

	it('answers nothing when the row carries no locale information', () => {
		expect(localeBadges('', ['en', 'fr'])).toEqual([])
		expect(localeBadges(undefined, ['en', 'fr'])).toEqual([])
	})
})

describe('localeChips', () => {
	it('keeps locales the workspace no longer offers after its own', () => {
		expect(localeChips('it,en', ['en', 'fr'])).toEqual([
			{ code: 'en', present: true },
			{ code: 'fr', present: false },
			{ code: 'it', present: true },
		])
		expect(localeChips('', ['en'])).toEqual([])
	})
})

describe('missingLocales', () => {
	it('lists the workspace locales a content lacks', () => {
		expect(missingLocales(['en'], ['en', 'fr', 'de'])).toEqual(['fr', 'de'])
		expect(missingLocales(['en', 'fr'], ['en', 'fr'])).toEqual([])
	})
})

describe('localeChipClass', () => {
	it('dashes a missing locale', () => {
		expect(localeChipClass(false)).toContain(LOCALE_CHIP_MISSING_CLASS)
		expect(localeChipClass(true)).not.toContain('border-dashed')
	})
})

describe('pickLocale', () => {
	it('matches a regional or upper-case request to its base language', () => {
		expect(pickLocale(['en', 'fr'], 'fr-BE', 'en')).toBe('fr')
		expect(pickLocale(['en', 'fr'], 'FR', 'en')).toBe('fr')
		expect(localeLanguage('fr_CA')).toBe('fr')
	})
	it('falls back like the server: tenant locale, English, then the first', () => {
		expect(pickLocale(['en', 'fr'], 'de', 'fr')).toBe('fr')
		expect(pickLocale(['en', 'fr'], 'de', 'nl')).toBe('en')
		expect(pickLocale(['fr', 'de'], 'nl', 'en')).toBe('fr')
	})
})

describe('languageLabel', () => {
	it('names a language in the interface language, capitalised', () => {
		expect(languageLabel('en', 'fr')).toBe('Anglais (EN)')
		expect(languageLabel('fr', 'fr')).toBe('Français (FR)')
		expect(languageLabel('fr', 'en')).toBe('French (FR)')
	})
	it('falls back to the given name, then to the code', () => {
		expect(languageLabel('zz', 'en', 'Zed')).toBe('Zed (ZZ)')
		expect(languageLabel('zz', 'en')).toBe('ZZ')
		expect(languageName('en', 'not a locale')).toBeUndefined()
	})
})
