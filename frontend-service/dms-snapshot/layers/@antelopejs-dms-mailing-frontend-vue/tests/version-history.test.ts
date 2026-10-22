import { describe, expect, it } from 'vitest'
import type { TemplateChange } from '../app/types/mailing'
import {
	changeSummary,
	formatVersionDate,
	isLiveVersion,
} from '../app/utils/version-history'

const translate = (key: string, params: Record<string, string> = {}) =>
	`${key.split('.').at(-1)}${params.variable ? `:${params.variable}` : ''}`

describe('version history', () => {
	it('names the first changes of a version and counts the rest', () => {
		const changes: TemplateChange[] = [
			{ locale: 'en', kind: 'subject' },
			{ locale: 'fr', kind: 'locale_added' },
			{ locale: '', kind: 'variable_added', variable: 'order.id' },
		]
		expect(changeSummary({ changes }, translate)).toEqual({
			named: ['EN · subject', 'FR · locale_added'],
			more: 1,
		})
		expect(changeSummary({ changes: [] }, translate)).toEqual({
			named: [],
			more: 0,
		})
	})

	it('marks live only the version customers receive', () => {
		expect(isLiveVersion(3, 3, 'live')).toBe(true)
		expect(isLiveVersion(2, 3, 'live')).toBe(false)
		expect(isLiveVersion(3, 3, 'draft')).toBe(false)
	})

	it('dates a version to the minute, on a 24-hour clock', () => {
		const text = formatVersionDate('2026-10-07T15:04:00Z', 'en-GB')
		expect(text).toMatch(/2026/)
		expect(text).not.toMatch(/PM|AM/i)
		expect(formatVersionDate('not a date', 'en-GB')).toBe('')
	})
})
