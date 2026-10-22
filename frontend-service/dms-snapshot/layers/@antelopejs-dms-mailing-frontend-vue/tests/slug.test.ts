import { describe, expect, it } from 'vitest'
import {
	MAX_NAME_LENGTH,
	MAX_SLUG_LENGTH,
	fitName,
	freeSlug,
	slugify,
	validateName,
	validateSlug,
} from '../app/utils/slug'

const NONE = new Set<string>()

describe('slugify', () => {
	it('derives an ASCII dashed slug from a name', () => {
		expect(slugify('Quote accepted')).toBe('quote-accepted')
		expect(slugify('Réinitialiser le mot de passe')).toBe(
			'reinitialiser-le-mot-de-passe',
		)
		expect(slugify('  Autumn sale — 20% off!  ')).toBe('autumn-sale-20-off')
	})

	it('answers an empty slug for a name without letters or digits', () => {
		expect(slugify('—')).toBe('')
	})

	it('cuts to the maximum length without a trailing dash', () => {
		const slug = slugify(`${'a'.repeat(MAX_SLUG_LENGTH - 1)} b`)
		expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
		expect(slug.endsWith('-')).toBe(false)
	})
})

describe('validateSlug', () => {
	it('accepts a well-formed free slug', () => {
		expect(validateSlug('order-confirmed', NONE)).toBeNull()
		expect(validateSlug('2fa-code', NONE)).toBeNull()
	})

	it('names what is wrong', () => {
		expect(validateSlug('', NONE)).toBe('required')
		expect(validateSlug('-order', NONE)).toBe('format')
		expect(validateSlug('Order', NONE)).toBe('format')
		expect(validateSlug('order_confirmed', NONE)).toBe('format')
		expect(validateSlug('a'.repeat(MAX_SLUG_LENGTH + 1), NONE)).toBe('too_long')
		expect(validateSlug('welcome', new Set(['welcome']))).toBe('taken')
	})
})

describe('validateName', () => {
	it('requires a non-blank name under the maximum length', () => {
		expect(validateName('Welcome')).toBeNull()
		expect(validateName('   ')).toBe('required')
		expect(validateName('a'.repeat(MAX_NAME_LENGTH + 1))).toBe('too_long')
	})
})

describe('freeSlug', () => {
	it('keeps a free slug and numbers a taken one', () => {
		expect(freeSlug('welcome-copy', NONE)).toBe('welcome-copy')
		expect(freeSlug('welcome-copy', new Set(['welcome-copy']))).toBe(
			'welcome-copy-2',
		)
		expect(
			freeSlug('welcome-copy', new Set(['welcome-copy', 'welcome-copy-2'])),
		).toBe('welcome-copy-3')
	})

	it('cuts the base so a numbered slug stays within the limit', () => {
		const base = 'a'.repeat(MAX_SLUG_LENGTH)
		const slug = freeSlug(base, new Set([base]))
		expect(slug).toHaveLength(MAX_SLUG_LENGTH)
		expect(slug.endsWith('-2')).toBe(true)
		expect(validateSlug(slug, new Set([base]))).toBeNull()
	})
})

describe('fitName', () => {
	const copy = (name: string) => `${name} (copy)`

	it('keeps a name that fits and cuts the inner name of one that does not', () => {
		expect(fitName('Welcome', copy)).toBe('Welcome (copy)')
		const long = fitName('a'.repeat(MAX_NAME_LENGTH), copy)
		expect(long).toHaveLength(MAX_NAME_LENGTH)
		expect(long.endsWith(' (copy)')).toBe(true)
		expect(validateName(long)).toBeNull()
	})
})
