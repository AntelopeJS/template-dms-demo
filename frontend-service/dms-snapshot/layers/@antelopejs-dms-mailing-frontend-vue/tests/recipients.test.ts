import { describe, expect, it } from 'vitest'
import {
	MAX_RECIPIENTS,
	isEmailAddress,
	isSendableRecipients,
	localeOptions,
} from '../app/utils/recipients'

describe('isSendableRecipients', () => {
	it('needs one to five valid addresses', () => {
		expect(isSendableRecipients(['camille@acme.com'])).toBe(true)
		expect(isSendableRecipients([])).toBe(false)
		expect(isSendableRecipients(['camille@acme'])).toBe(false)
		expect(
			isSendableRecipients(
				Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@acme.com`),
			),
		).toBe(false)
	})

	it('reads an address loosely but refuses spaces', () => {
		expect(isEmailAddress(' julie@acme.com ')).toBe(true)
		expect(isEmailAddress('julie @acme.com')).toBe(false)
	})
})

describe('localeOptions', () => {
	it('names a locale after the workspace, else shows its code', () => {
		expect(
			localeOptions(['fr', 'it'], [{ code: 'fr', name: 'Français' }]),
		).toEqual([
			{ label: 'Français (FR)', value: 'fr' },
			{ label: 'IT', value: 'it' },
		])
	})
})

describe('localeOptions in the interface language', () => {
	it('names every locale in the language the interface speaks', () => {
		expect(
			localeOptions(['en', 'fr'], [{ code: 'fr', name: 'français' }], 'fr'),
		).toEqual([
			{ label: 'Anglais (EN)', value: 'en' },
			{ label: 'Français (FR)', value: 'fr' },
		])
	})
})
