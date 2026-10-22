import { describe, expect, it } from 'vitest'
import {
	insertSuggestion,
	insertTokenAt,
	suggestPaths,
	tokenQueryAt,
} from '../app/utils/autocomplete'
import type { VariableDefinition } from '../app/types/mailing'

const VARIABLES: VariableDefinition[] = [
	{ path: 'order.total', type: 'money', required: true },
	{ path: 'order.number', type: 'string', required: true },
	{ path: 'customer.firstName', type: 'string', required: false },
]

describe('tokenQueryAt', () => {
	it('finds the path typed after an open {{', () => {
		expect(tokenQueryAt('Hi {{ord', 8)).toEqual({ start: 3, query: 'ord' })
		expect(tokenQueryAt('Hi {{', 5)).toEqual({ start: 3, query: '' })
		expect(tokenQueryAt('Hi {{ order', 11)).toEqual({
			start: 3,
			query: 'order',
		})
	})
	it('is closed once the token is, or when the caret left it', () => {
		expect(tokenQueryAt('Hi {{order}} there', 18)).toBeNull()
		expect(tokenQueryAt('Hi {{order and more', 19)).toBeNull()
		expect(tokenQueryAt('No token', 8)).toBeNull()
	})
})

describe('suggestPaths', () => {
	const sources = {
		variables: VARIABLES,
		detected: ['order.trackingUrl', 'order.total'],
		system: ['unsubscribeUrl', 'preferencesUrl'],
	}
	it('lists prefix matches first, flagging undeclared paths', () => {
		const result = suggestPaths('order', sources)
		expect(result.map((entry) => entry.path)).toEqual([
			'order.total',
			'order.number',
			'order.trackingUrl',
		])
		expect(result[2]).toEqual({
			path: 'order.trackingUrl',
			type: null,
			status: 'undeclared',
		})
		expect(result[0]?.type).toBe('money')
	})
	it('matches inside paths too and offers the system paths', () => {
		expect(suggestPaths('url', sources).map((entry) => entry.status)).toEqual([
			'undeclared',
			'system',
			'system',
		])
		expect(suggestPaths('', sources)).toHaveLength(6)
	})
})

describe('insertSuggestion', () => {
	it('replaces the typed token and places the caret after it', () => {
		const text = 'Hi {{ord there'
		const query = tokenQueryAt(text, 8)!
		expect(insertSuggestion(text, query, 8, 'order.total')).toEqual({
			text: 'Hi {{order.total}} there',
			caret: 18,
		})
	})
	it('swallows the rest of the path and an existing closing }}', () => {
		const text = 'Hi {{or}}!'
		const query = tokenQueryAt(text, 7)!
		expect(insertSuggestion(text, query, 7, 'order.number').text).toBe(
			'Hi {{order.number}}!',
		)
	})
	it('inserts a token at the caret', () => {
		expect(insertTokenAt('Hello !', 6, 'customer.firstName')).toEqual({
			text: 'Hello {{customer.firstName}}!',
			caret: 28,
		})
	})
})
