import { describe, expect, it } from 'vitest'
import { exampleVariables, sendSnippet } from '../app/utils/send-snippet'

describe('exampleVariables', () => {
	it('nests the paths, system URLs included, with test values or examples', () => {
		expect(
			exampleVariables({
				slug: 'password-reset',
				locale: 'en',
				variables: [
					{ path: 'user.firstName', type: 'string' },
					{ path: 'reset.url', type: 'url' },
					{ path: 'order.items[].name', type: 'string' },
					{ path: 'unsubscribeUrl', type: 'url' },
					{ path: 'user', type: 'string' },
				],
				testData: { user: { firstName: 'Sofie' } },
			}),
		).toEqual({
			user: { firstName: 'Sofie' },
			reset: { url: 'https://…' },
			order: { items: [] },
			unsubscribeUrl: 'https://…',
		})
	})
})

describe('sendSnippet', () => {
	it('writes a call with every required parameter', () => {
		const snippet = sendSnippet({
			slug: 'password-reset',
			locale: 'fr',
			variables: [{ path: 'reset.url', type: 'url' }],
			testData: {},
		})
		expect(snippet).toBe(
			[
				'await SendTemplate("password-reset", {',
				'  tenantId,',
				'  to: customer.email,',
				'  locale: "fr",',
				'  variables: {',
				'    reset: {',
				'      url: "https://…"',
				'    }',
				'  },',
				'});',
			].join('\n'),
		)
	})
})
