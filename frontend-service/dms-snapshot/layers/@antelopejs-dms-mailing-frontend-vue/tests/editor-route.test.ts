import { describe, expect, it } from 'vitest'
import {
	editorRoute,
	recordLabelFor,
	templateIdFrom,
} from '../app/utils/editor-route'
import { TEMPLATES_PATH } from '../app/utils/pages'

describe('editorRoute', () => {
	it('targets the record page under Templates', () => {
		expect(editorRoute('abc')).toEqual({
			path: `${TEMPLATES_PATH}/abc`,
			query: {},
		})
	})
	it('carries the locale when one is selected', () => {
		expect(editorRoute('abc', 'fr')).toEqual({
			path: '/modules/mailing/templates/abc',
			query: { locale: 'fr' },
		})
	})
	it('omits an empty locale rather than sending a blank query param', () => {
		expect(editorRoute('abc', '').query).toEqual({})
	})
})

describe('templateIdFrom', () => {
	it('prefers the route param', () => {
		expect(templateIdFrom({ id: 't1' }, '/modules/mailing/templates/t2')).toBe(
			't1',
		)
	})
	it('falls back to the last path segment', () => {
		expect(templateIdFrom(undefined, '/modules/mailing/templates/t2/')).toBe(
			't2',
		)
		expect(templateIdFrom({ id: '' }, '/modules/mailing/templates/a%20b')).toBe(
			'a b',
		)
	})
})

describe('recordLabelFor', () => {
	it('names the page with the template, or clears the label', () => {
		expect(recordLabelFor('/p', 'Order')).toEqual({
			path: '/p',
			label: 'Order',
		})
		expect(recordLabelFor('/p', '')).toBeNull()
	})
})
