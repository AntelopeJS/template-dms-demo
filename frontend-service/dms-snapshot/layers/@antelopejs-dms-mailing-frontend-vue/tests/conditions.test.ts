import { describe, expect, it } from 'vitest'
import {
	describeCondition,
	evaluateCondition,
} from '../app/utils/conditions'

describe('conditions', () => {
	it('describes with translated operator labels', () => {
		expect(
			describeCondition(
				{ path: 'a', operator: 'ne', value: '1' },
				(key) => key.split('.').at(-1) ?? key,
			),
		).toBe('a ne 1')
	})
})

describe('evaluateCondition', () => {
	const data = { order: { total: 120, country: 'BE', isFirstOrder: false } }
	it('evaluates like the backend engine', () => {
		expect(
			evaluateCondition(
				{ path: 'order.isFirstOrder', operator: 'truthy', value: '' },
				data,
			),
		).toBe(false)
		expect(
			evaluateCondition(
				{ path: 'order.isFirstOrder', operator: 'falsy', value: '' },
				data,
			),
		).toBe(true)
		expect(
			evaluateCondition(
				{ path: 'order.country', operator: 'eq', value: 'BE' },
				data,
			),
		).toBe(true)
		expect(
			evaluateCondition(
				{ path: 'order.country', operator: 'ne', value: 'BE' },
				data,
			),
		).toBe(false)
		expect(
			evaluateCondition(
				{ path: 'order.total', operator: 'gt', value: '100' },
				data,
			),
		).toBe(true)
		expect(
			evaluateCondition(
				{ path: 'order.total', operator: 'lt', value: '100' },
				data,
			),
		).toBe(false)
		expect(
			evaluateCondition(
				{ path: 'missing.path', operator: 'truthy', value: '' },
				data,
			),
		).toBe(false)
	})
})
