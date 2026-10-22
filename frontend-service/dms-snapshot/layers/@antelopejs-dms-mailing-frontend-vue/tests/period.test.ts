import { describe, expect, it } from 'vitest'
import {
	clampRetention,
	isWithinADay,
	minutesSince,
	presetShortLabelKey,
	RETENTION_CUSTOM,
	retentionChoice,
} from '../app/utils/period'

describe('presetShortLabelKey', () => {
	it('maps a preset id onto an i18n key', () => {
		expect(presetShortLabelKey('last-24h')).toBe(
			'dms_mailing.period.short.last_24h',
		)
		expect(presetShortLabelKey('last-30-days')).toBe(
			'dms_mailing.period.short.last_30_days',
		)
	})
})

describe('minutesSince', () => {
	const now = new Date('2026-09-09T10:35:00.000Z')
	it('counts whole minutes', () => {
		expect(minutesSince('2026-09-09T10:00:00.000Z', now)).toBe(35)
	})
	it('answers 0 for a missing or future date', () => {
		expect(minutesSince(null, now)).toBe(0)
		expect(minutesSince('2026-09-09T11:00:00.000Z', now)).toBe(0)
	})
})

describe('isWithinADay', () => {
	const now = new Date('2026-09-09T22:00:00.000Z')
	it('says tonight for a run within 24 hours', () => {
		expect(isWithinADay('2026-09-10T03:15:00.000Z', now)).toBe(true)
		expect(isWithinADay('2026-09-11T03:15:00.000Z', now)).toBe(false)
	})
})

describe('retention presets', () => {
	it('picks the preset segment, else custom', () => {
		expect(retentionChoice(90)).toBe('90')
		expect(retentionChoice(45)).toBe(RETENTION_CUSTOM)
		expect(retentionChoice(null)).toBe(RETENTION_CUSTOM)
	})
	it('brings a typed value between 1 day and 10 years', () => {
		expect(clampRetention(0)).toBe(1)
		expect(clampRetention(5000)).toBe(3650)
		expect(clampRetention(12.6)).toBe(13)
		expect(clampRetention(Number.NaN)).toBe(1)
	})
})
