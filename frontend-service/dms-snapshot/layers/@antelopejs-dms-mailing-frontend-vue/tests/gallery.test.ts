import { describe, expect, it } from 'vitest'
import {
	UNCATEGORISED_GROUP_ID,
	firstName,
	CARD_DATE_FORMAT,
	formatCardDate,
	formatCardSince,
	groupByCategory,
	isAttentionView,
	isNarrowed,
	matchesSearch,
	searchTermOf,
	userFilterKeys,
} from '../app/utils/gallery'

const CATEGORIES = [
	{ id: 'orders', label: 'Orders', icon: 'i-ph-package' },
	{ id: 'billing', label: 'Billing', icon: 'i-ph-file-text' },
]
const rows = [
	{ _id: '1', category: 'billing' },
	{ _id: '2', category: 'orders' },
	{ _id: '3', category: 'unknown' },
	{ _id: '4' },
	{ _id: '5', category: null },
]

describe('groupByCategory', () => {
	it('keeps the settings order and collects the uncategorised last', () => {
		const groups = groupByCategory(rows, CATEGORIES, 'Uncategorised')
		expect(groups.map((group) => group.category.id)).toEqual([
			'orders',
			'billing',
			UNCATEGORISED_GROUP_ID,
		])
		expect(groups[2]?.items.map((row) => row._id)).toEqual(['3', '4', '5'])
	})

	it('labels the trailing group with what the caller translated', () => {
		const groups = groupByCategory([{ _id: '1' }], [], 'Sans catégorie')
		expect(groups[0]?.category.label).toBe('Sans catégorie')
	})

	it('drops empty groups', () => {
		const groups = groupByCategory(
			[{ _id: '1', category: 'orders' }],
			CATEGORIES,
			'x',
		)
		expect(groups.map((group) => group.category.id)).toEqual(['orders'])
	})
})

describe('table query helpers', () => {
	it('reads the trimmed search term', () => {
		expect(searchTermOf({ search: '  refund ' })).toBe('refund')
		expect(searchTermOf({ search: undefined })).toBe('')
		expect(searchTermOf(undefined)).toBe('')
	})

	it('tells user filters from the status tab', () => {
		const query = {
			filter_status: 'is:draft',
			filter_category: 'is:billing',
			sortKey: 'updatedAt',
		}
		expect(userFilterKeys(query)).toEqual(['filter_category'])
		expect(isNarrowed(query)).toBe(true)
		expect(isNarrowed({ filter_status: 'is_not:archived' })).toBe(false)
		expect(isNarrowed({ search: 'x' })).toBe(true)
	})

	it('tells the attention tab, which is no user filter either', () => {
		const query = { filter_needsAttention: 'is:true' }
		expect(isAttentionView(query)).toBe(true)
		expect(isAttentionView({ filter_status: 'is:live' })).toBe(false)
		expect(isNarrowed(query)).toBe(false)
	})
})

describe('formatCardDate', () => {
	const now = new Date('2026-10-07T12:00:00Z')

	it('reads recent edits as relative time', () => {
		expect(formatCardDate('2026-10-07T10:00:00Z', now, 'en')).toBe('2 hr. ago')
		expect(formatCardDate('2026-10-07T11:55:00Z', now, 'en')).toBe('5 min. ago')
		expect(formatCardDate('2026-10-07T10:00:00Z', now, 'fr')).toMatch(
			/^il y a 2\sh$/,
		)
	})

	it('reads older ones as a short date', () => {
		expect(formatCardDate('2026-09-27T09:00:00Z', now, 'en')).toBe('Sep 27')
	})

	it("writes the date with the formatter given: a server writes the reader's day", () => {
		const late = '2026-09-27T02:00:00Z'
		const inZone = (timeZone: string) =>
			new Intl.DateTimeFormat('en', { ...CARD_DATE_FORMAT, timeZone })
		expect(
			formatCardDate(late, now, 'en', undefined, inZone('Europe/Paris')),
		).toBe('Sep 27')
		expect(
			formatCardDate(late, now, 'en', undefined, inZone('America/New_York')),
		).toBe('Sep 26')
		expect(
			formatCardSince(late, now, 'en', inZone('America/New_York')),
		).toEqual({ kind: 'date', text: 'Sep 26' })
	})

	it('answers nothing for an unreadable date', () => {
		expect(formatCardDate('', now, 'en')).toBe('')
		expect(formatCardDate('nope', now, 'en')).toBe('')
	})
})

describe('matchesSearch', () => {
	it('finds the term in any field, whatever its case', () => {
		const row = { name: 'Order confirmation', slug: 'order' }
		expect(matchesSearch(row, ' ORDER ', ['name', 'slug'])).toBe(true)
		expect(matchesSearch(row, 'refund', ['name', 'slug'])).toBe(false)
		expect(matchesSearch(row, '', [])).toBe(true)
	})
})

describe('firstName', () => {
	it('keeps the first word of a name', () => {
		expect(firstName('Hugo Bernard')).toBe('Hugo')
		expect(firstName('')).toBe('')
		expect(firstName(undefined)).toBe('')
	})
})

describe('formatCardDate with words around the date', () => {
	const now = new Date('2026-10-07T12:00:00Z')
	const onDate = (date: string) => `le ${date}`
	it('dresses an absolute date only', () => {
		expect(formatCardDate('2026-09-27T09:00:00Z', now, 'en', onDate)).toBe(
			'le Sep 27',
		)
		expect(formatCardDate('2026-10-07T11:55:00Z', now, 'en', onDate)).toBe(
			'5 min. ago',
		)
		expect(formatCardDate('', now, 'en', onDate)).toBe('')
	})
})

describe('formatCardSince', () => {
	const now = new Date('2026-10-07T12:00:00Z')

	it('reads a recent start as a duration, without "ago"', () => {
		expect(formatCardSince('2026-10-07T11:00:00Z', now, 'en')).toEqual({
			kind: 'duration',
			text: '1 hr',
		})
		expect(
			formatCardSince('2026-10-07T11:55:00Z', now, 'fr')?.text.replace(
				/\s/g,
				' ',
			),
		).toBe('5 min')
		expect(
			formatCardSince('2026-10-07T11:00:00Z', now, 'fr')?.text.replace(
				/\s/g,
				' ',
			),
		).toBe('1 h')
	})

	it('reads an older start as a date', () => {
		expect(formatCardSince('2026-09-27T10:00:00Z', now, 'en')).toEqual({
			kind: 'date',
			text: 'Sep 27',
		})
		expect(formatCardSince('bad', now, 'en')).toBe(null)
	})
})
