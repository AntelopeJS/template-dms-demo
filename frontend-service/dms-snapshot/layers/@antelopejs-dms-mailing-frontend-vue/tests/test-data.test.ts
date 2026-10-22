import { describe, expect, it } from 'vitest'
import { parseTestData } from '../app/utils/testData'

describe('parseTestData', () => {
	it('returns the object for a valid JSON object', () => {
		expect(parseTestData('{"order":{"total":42}}')).toEqual({
			order: { total: 42 },
		})
	})
	it('returns null for invalid JSON and for non-objects', () => {
		expect(parseTestData('{')).toBeNull()
		expect(parseTestData('[1,2]')).toBeNull()
		expect(parseTestData('"text"')).toBeNull()
	})
})
