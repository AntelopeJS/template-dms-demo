import { expect, it } from 'vitest'
import { ComponentsDemoApi } from '../../src/components/demo-api'

it('plots the requested period rather than the last thirty days', () => {
	const api = new ComponentsDemoApi()
	const result = api.getSales(
		'custom',
		'2024-02-27T00:00:00Z',
		'previous-period',
		'2024-03-02T23:59:59Z',
	)
	const dates = [
		'2024-02-27',
		'2024-02-28',
		'2024-02-29',
		'2024-03-01',
		'2024-03-02',
	]
	expect(result.series[0].data.map((point) => point.x)).toEqual(dates)
	expect(result.comparisonSeries?.[0].data.map((point) => point.x)).toEqual(
		dates,
	)
	expect(
		api.getSales(
			'today',
			'2024-03-02T00:00:00Z',
			'none',
			'2024-03-02T23:59:59Z',
		).series[0].data,
	).toHaveLength(1)
	const year = api.getSales('custom', '2024-01-01', 'none', '2024-12-31')
		.series[0].data
	expect(year).toHaveLength(30)
	expect(year[0].x).toBe('2024-01-01')
	expect(year.at(-1)?.x).toBe('2024-12-31')
})
