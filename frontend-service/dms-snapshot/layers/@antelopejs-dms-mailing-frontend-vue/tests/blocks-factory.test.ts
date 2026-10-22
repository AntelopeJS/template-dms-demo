import { describe, expect, it } from 'vitest'
import {
	BLOCK_PALETTE,
	LOGIC_PALETTE,
	createBlock,
	newBlockId,
} from '../app/utils/blocks'

describe('block factory', () => {
	it('creates every palette block with a unique id and no visibility rule', () => {
		const ids = new Set<string>()
		for (const entry of [...BLOCK_PALETTE, ...LOGIC_PALETTE]) {
			const block = createBlock(entry.type)
			expect(block.type).toBe(entry.type)
			expect(block.visibleIf).toBeNull()
			expect(ids.has(block.id)).toBe(false)
			ids.add(block.id)
		}
	})
	it('gives an if block an empty then-branch and no else-branch', () => {
		const block = createBlock('if')
		expect(block.type === 'if' && block.children).toEqual([])
		expect(block.type === 'if' && block.elseChildren).toBeNull()
	})
	it('prefixes ids with the type', () => {
		expect(newBlockId('heading')).toMatch(/^heading_[a-z0-9]{6}$/)
	})
	it('invents no variable token in a new block', () => {
		expect(createBlock('code')).toMatchObject({ text: '' })
		expect(createBlock('total')).toMatchObject({ value: '' })
	})
	it('points lists and conditions at a declared variable of the right type', () => {
		const context = {
			variables: [
				{ path: 'contact.name', type: 'string' as const, required: false },
				{ path: 'cart.items', type: 'array' as const, required: false },
				{ path: 'contact.vip', type: 'boolean' as const, required: false },
			],
		}
		expect(createBlock('list', context)).toMatchObject({ source: 'cart.items' })
		const branch = createBlock('if', context)
		expect(branch.type === 'if' && branch.condition.path).toBe('contact.vip')
		const fallback = createBlock('if', { detected: ['order.id'] })
		expect(fallback.type === 'if' && fallback.condition.path).toBe('order.id')
	})
	it('writes the footer labels in the locale of the page', () => {
		expect(createBlock('footer', { locale: 'fr' })).toMatchObject({
			unsubscribeLabel: 'Se désinscrire',
			preferencesLabel: 'Préférences',
		})
		expect(createBlock('footer', { locale: 'de' })).toMatchObject({
			unsubscribeLabel: 'Unsubscribe',
		})
	})
})

describe('starting words', () => {
	it('speak the language of the locale being edited', () => {
		const context = { locale: 'fr-BE' }
		expect(createBlock('heading', context)).toMatchObject({
			text: 'Nouveau titre',
		})
		expect(createBlock('paragraph', context)).toMatchObject({
			text: 'Votre texte…',
		})
		expect(createBlock('button', context)).toMatchObject({ text: 'Bouton' })
	})
	it('fall back to English for a language without its own', () => {
		expect(createBlock('heading', { locale: 'de' })).toMatchObject({
			text: 'New heading',
		})
		expect(createBlock('button')).toMatchObject({ text: 'Button' })
	})
})
