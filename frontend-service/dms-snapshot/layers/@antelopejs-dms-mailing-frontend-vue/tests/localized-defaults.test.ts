import { describe, expect, it } from 'vitest'
import {
	defaultCategoryLabelKey,
	localizeCategories,
} from '../app/utils/categories'
import { localizeStarters, starterNameKey } from '../app/utils/starters'

const FRENCH: Record<string, string> = {
	'dms_mailing.categories.defaults.orders': 'Commandes',
	'dms_mailing.categories.defaults.billing': 'Facturation',
	'dms_mailing.starters.names.order-confirmed': 'Confirmation de commande',
}
const translate = (key: string): string | undefined => FRENCH[key]

describe('localizeCategories', () => {
	it('translates a shipped category nobody renamed', () => {
		const [orders] = localizeCategories(
			[{ id: 'orders', label: 'Orders', icon: 'i-ph-package' }],
			translate,
		)
		expect(orders).toEqual({
			id: 'orders',
			label: 'Commandes',
			icon: 'i-ph-package',
		})
	})
	it('keeps a label someone wrote, and a category it cannot translate', () => {
		const categories = [
			{ id: 'billing', label: 'Invoices & receipts', icon: 'i-ph-file-text' },
			{ id: 'forms', label: 'Forms', icon: 'i-ph-textbox' },
			{ id: 'news', label: 'News', icon: 'i-ph-newspaper' },
		]
		expect(localizeCategories(categories, translate)).toEqual(categories)
		expect(defaultCategoryLabelKey(categories[2]!)).toBeUndefined()
	})
})

describe('localizeStarters', () => {
	it('names a known starter in the interface language, else as shipped', () => {
		const starters = [
			{ id: 'order-confirmed', name: 'Order confirmation' },
			{ id: 'custom', name: 'Custom starter' },
		].map((starter) => ({
			...starter,
			slug: starter.id,
			category: 'orders',
			locales: ['en', 'fr'],
		}))
		expect(
			localizeStarters(starters, translate).map((starter) => starter.name),
		).toEqual(['Confirmation de commande', 'Custom starter'])
		expect(starterNameKey('custom')).toBe('dms_mailing.starters.names.custom')
	})
})
