import { describe, expect, it } from 'vitest'
import {
	attentionReasons,
	cardFooter,
	daysSince,
	validTransitions,
	variablesCovered,
} from '../app/utils/template-attention'
import type { TemplateRow, TemplateStats } from '../app/types/mailing'

const NOW = new Date('2026-10-07T12:00:00Z')

function row(overrides: Partial<TemplateRow> = {}): TemplateRow {
	return {
		_id: 't1',
		slug: 'order-confirmed',
		name: 'Order confirmation',
		status: 'live',
		locales: 'en,fr,de',
		updatedAt: '2026-10-06T12:00:00Z',
		updatedBy: 'Julie Martin',
		publishedVersion: 3,
		publishedAt: '2026-09-22T09:00:00Z',
		isDraftPending: false,
		attention: '',
		...overrides,
	}
}

function stats(sends: number): TemplateStats {
	return {
		id: 't1',
		slug: 'order-confirmed',
		sends,
		openRate: 71.9,
		problems: 0,
		lastSentAt: null,
	}
}

describe('daysSince', () => {
	it('counts whole days and ignores unreadable dates', () => {
		expect(daysSince('2026-09-27T12:00:00Z', NOW)).toBe(10)
		expect(daysSince('not a date', NOW)).toBe(0)
		expect(daysSince(null, NOW)).toBe(0)
	})
})

describe('attentionReasons', () => {
	it('reads the reasons the server stored on the row', () => {
		expect(attentionReasons(row())).toEqual([])
		expect(
			attentionReasons(row({ attention: 'stale_draft,missing_locale' })),
		).toEqual(['stale_draft', 'missing_locale'])
	})
})

describe('cardFooter', () => {
	it('shows the figures once real sends exist', () => {
		expect(cardFooter(row(), stats(6812))).toMatchObject({
			kind: 'stats',
			sends: 6812,
			openRate: 71.9,
		})
	})

	it('says since when a live template waits for its first send', () => {
		expect(cardFooter(row(), stats(0))).toMatchObject({
			kind: 'no_send',
			at: '2026-09-22T09:00:00Z',
		})
		expect(cardFooter(row({ publishedAt: null }))).toMatchObject({
			kind: 'no_send',
			at: '2026-10-06T12:00:00Z',
		})
	})

	it('names the last editor of a draft', () => {
		expect(cardFooter(row({ status: 'draft' }))).toMatchObject({
			kind: 'edited',
			by: 'Julie Martin',
		})
	})
})

describe('validTransitions', () => {
	it('offers only the moves the backend accepts', () => {
		expect(validTransitions(row({ status: 'draft' }))).toEqual([
			'publish',
			'archive',
		])
		expect(validTransitions(row())).toEqual(['unpublish', 'archive'])
		expect(validTransitions(row({ isDraftPending: true }))).toEqual([
			'publish',
			'unpublish',
			'archive',
		])
		expect(validTransitions(row({ status: 'archived' }))).toEqual(['restore'])
	})
})

describe('variablesCovered', () => {
	const declared = [
		{ path: 'customer.firstName', type: 'string' as const, required: true },
		{ path: 'order.isFirstOrder', type: 'boolean' as const, required: false },
	]

	it('needs every used path declared and every required one filled', () => {
		expect(
			variablesCovered(declared, ['customer.firstName'], {
				customer: { firstName: 'Margaux' },
			}),
		).toBe(true)
		expect(
			variablesCovered(declared, ['customer.firstName'], { customer: {} }),
		).toBe(false)
		expect(
			variablesCovered(declared, ['order.trackingUrl'], {
				customer: { firstName: 'Margaux' },
			}),
		).toBe(false)
	})
})
