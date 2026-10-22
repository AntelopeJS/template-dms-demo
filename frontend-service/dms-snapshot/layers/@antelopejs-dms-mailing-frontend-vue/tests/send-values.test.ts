import { describe, expect, it } from 'vitest'
import {
	buildSendData,
	initialSendValues,
	missingRequiredPaths,
	sendFields,
} from '../app/utils/send-values'
import { sendLogRoute } from '../app/utils/send-link'

const TEST_DATA = {
	user: { firstName: 'Julie', isPro: true },
	order: { lines: [{ label: 'Chair' }] },
	promo: 'AUTUMN',
}

describe('real send values', () => {
	const fields = sendFields(
		[
			{ path: 'user.firstName', type: 'string', required: true },
			{ path: 'reset.url', type: 'url', required: true },
			{ path: 'order.lines[]', type: 'array', required: false },
		],
		['user.firstName', 'user.isPro', 'promo', 'order.lines'],
		TEST_DATA,
	)

	it('lists the declared variables, then the undeclared ones the content uses', () => {
		expect(fields).toEqual([
			{ path: 'user.firstName', required: true, kind: 'text' },
			{ path: 'reset.url', required: true, kind: 'text' },
			{ path: 'order.lines', required: false, kind: 'list' },
			{ path: 'user.isPro', required: false, kind: 'boolean' },
			{ path: 'promo', required: false, kind: 'text' },
		])
	})

	it('starts from the test data and names the required values still missing', () => {
		const values = initialSendValues(fields, TEST_DATA)
		expect(values).toEqual({
			'user.firstName': 'Julie',
			'reset.url': '',
			'order.lines': [{ label: 'Chair' }],
			'user.isPro': true,
			promo: 'AUTUMN',
		})
		expect(missingRequiredPaths(fields, values)).toEqual(['reset.url'])
		expect(
			missingRequiredPaths(fields, { ...values, 'reset.url': '  ' }),
		).toEqual(['reset.url'])
	})

	it('nests the values given into the data of the send', () => {
		const values = {
			...initialSendValues(fields, TEST_DATA),
			'reset.url': 'https://x.test/r',
			promo: '',
		}
		expect(buildSendData(fields, values)).toEqual({
			user: { firstName: 'Julie', isPro: true },
			reset: { url: 'https://x.test/r' },
			order: { lines: [{ label: 'Chair' }] },
		})
	})

	it('keeps a typed child value over the object the content also prints', () => {
		const orderData = {
			user: { firstName: 'Julie' },
			order: { number: 'A-42', total: 12 },
			meta: { source: 'shop' },
		}
		const orderFields = sendFields(
			[{ path: 'order.number', type: 'string', required: true }],
			['order', 'order.number', 'user', 'user.firstName', 'meta'],
			orderData,
		)
		expect(orderFields).toEqual([
			{ path: 'order.number', required: true, kind: 'text' },
			{ path: 'user.firstName', required: false, kind: 'text' },
			{ path: 'meta', required: false, kind: 'object' },
		])
		const values = {
			...initialSendValues(orderFields, orderData),
			'order.number': 'B-7',
		}
		expect(values.meta).toEqual({ source: 'shop' })
		expect(buildSendData(orderFields, values)).toEqual({
			order: { number: 'B-7' },
			user: { firstName: 'Julie' },
			meta: { source: 'shop' },
		})
	})

	it('applies the parent object first and never changes the test data', () => {
		const data = { order: { number: 'A-42', total: 12 } }
		const parentFirst = [
			{ path: 'order.number', required: true, kind: 'text' as const },
			{ path: 'order', required: false, kind: 'object' as const },
		]
		expect(
			buildSendData(parentFirst, { 'order.number': 'B-7', order: data.order }),
		).toEqual({ order: { number: 'B-7', total: 12 } })
		expect(data.order.number).toBe('A-42')
	})
})

describe('send log link', () => {
	it('opens the one send that went out, the log otherwise', () => {
		expect(sendLogRoute([{ sendId: 's1', status: 'sent' }])).toEqual({
			path: '/modules/mailing/sends',
			query: { record: 's1' },
		})
		expect(
			sendLogRoute([
				{ sendId: 's1', status: 'sent' },
				{ sendId: 's2', status: 'sent' },
			]),
		).toEqual({ path: '/modules/mailing/sends', query: {} })
	})
})
