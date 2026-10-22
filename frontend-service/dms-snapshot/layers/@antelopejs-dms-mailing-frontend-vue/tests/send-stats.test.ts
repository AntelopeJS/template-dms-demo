import { describe, expect, it } from 'vitest'
import { formatLatency, isSlowLatency } from '../app/utils/send-stats'

describe('formatLatency', () => {
	it('prints milliseconds, seconds past 5 s, a dash when unknown', () => {
		expect(formatLatency(204, 'en-GB')).toBe('204 ms')
		expect(formatLatency(30000, 'en-GB')).toBe('30.0 s')
		expect(formatLatency(null, 'en-GB')).toBe('—')
		expect(isSlowLatency(30000)).toBe(true)
		expect(isSlowLatency(204)).toBe(false)
	})
})
