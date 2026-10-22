import { describe, expect, it } from 'vitest'
import {
	contentChecks,
	missingRequired,
	openIssueCount,
	publishBlockers,
	publishChecks,
	testDataChecks,
	tokenChecks,
	undeclaredPaths,
} from '../app/utils/editor-checks'
import type {
	Block,
	TemplateContent,
	VariableDefinition,
} from '../app/types/mailing'

const VARIABLES: VariableDefinition[] = [
	{ path: 'order.number', type: 'string', required: true },
	{ path: 'order.isFirstOrder', type: 'boolean', required: false },
]

const BLOCKS: Block[] = [
	{
		id: 'if1',
		type: 'if',
		condition: { path: 'order.isFirstOrder', operator: 'truthy', value: '' },
		children: [],
		elseChildren: null,
		visibleIf: null,
	},
]

const INPUT = {
	variables: VARIABLES,
	detected: ['order.number', 'order.isFirstOrder', 'order.trackingUrl'],
	data: { order: { number: '#1', isFirstOrder: false } },
	blocks: BLOCKS,
}

describe('editor checks', () => {
	it('finds undeclared paths and required ones missing from the data', () => {
		expect(undeclaredPaths(INPUT.detected, VARIABLES)).toEqual([
			'order.trackingUrl',
		])
		expect(missingRequired(VARIABLES, {})).toEqual(['order.number'])
		expect(missingRequired(VARIABLES, INPUT.data)).toEqual([])
	})
	it('lists the publish warnings', () => {
		expect(
			publishChecks({ ...INPUT, data: {} }).map((check) => check.key),
		).toEqual([
			'dms_mailing.editor.checks.undeclared',
			'dms_mailing.editor.checks.required_missing',
		])
	})
	it('reports coverage and how each condition evaluates', () => {
		const checks = testDataChecks(INPUT)
		expect(
			checks.map((check) => [check.state, check.key.split('.').at(-1)]),
		).toEqual([
			['ok', 'required_covered'],
			['warn', 'missing_undeclared'],
			['info', 'condition_false'],
		])
		expect(checks[0]?.params).toEqual({ count: 1 })
		expect(openIssueCount(checks)).toBe(1)
	})
	it('flags a required variable the content does not use when the data lacks it', () => {
		const checks = testDataChecks({ ...INPUT, detected: [], data: {} })
		expect(checks.map((check) => check.key.split('.').at(-1))).toEqual([
			'required_missing',
			'condition_false',
		])
	})
})

const FOOTER: Block = {
	id: 'footer',
	type: 'footer',
	text: '',
	unsubscribeLabel: 'Unsubscribe',
	preferencesLabel: 'Preferences',
	visibleIf: null,
}

const PARAGRAPH: Block = {
	id: 'p1',
	type: 'paragraph',
	text: 'Hello',
	align: 'left',
	visibleIf: null,
}

const CONTENT: TemplateContent = {
	locales: {
		en: { subject: 'Hi', preheader: '', blocks: [PARAGRAPH, FOOTER] },
		fr: { subject: ' ', preheader: '', blocks: [FOOTER] },
		de: { subject: 'Hallo', preheader: '', blocks: [PARAGRAPH] },
	},
}

describe('content checks', () => {
	it('blocks a publish on a blank subject', () => {
		expect(publishBlockers(CONTENT).map((check) => check.params)).toEqual([
			{ locale: 'FR' },
		])
	})
	it('warns about an empty body, a missing footer and a missing locale', () => {
		const checks = contentChecks({
			content: CONTENT,
			locales: ['en', 'fr', 'de', 'nl'],
			fallback: 'en',
		})
		expect(
			checks.map((check) => [check.key.split('.').at(-1), check.params]),
		).toEqual([
			['no_blocks', { locale: 'FR' }],
			['no_footer', { locale: 'DE' }],
			['missing_locale', { locale: 'NL', fallback: 'EN' }],
		])
	})
	it('names the locale a missing one really falls back to', () => {
		const checks = contentChecks({
			content: { locales: { fr: CONTENT.locales.fr! } },
			locales: ['en', 'fr'],
			fallback: 'en',
		})
		expect(checks.at(-1)?.params).toEqual({ locale: 'EN', fallback: 'FR' })
	})
})

describe('footer and token checks', () => {
	it('warns about a second footer and a footer before other blocks', () => {
		const checks = contentChecks({
			content: {
				locales: {
					en: {
						subject: 'Hi',
						preheader: '',
						blocks: [FOOTER, PARAGRAPH, { ...FOOTER, id: 'footer2' }],
					},
					fr: { subject: 'Salut', preheader: '', blocks: [FOOTER, PARAGRAPH] },
				},
			},
			locales: ['en', 'fr'],
			fallback: 'en',
		})
		expect(
			checks.map((check) => [check.key.split('.').at(-1), check.params.locale]),
		).toEqual([
			['many_footers', 'EN'],
			['footer_not_last', 'FR'],
		])
	})
	it('flags malformed tokens and objects or lists printed as text', () => {
		const content: TemplateContent = {
			locales: {
				en: {
					subject: 'Order {{order.number}} {{ order number }}',
					preheader: '{{order}}',
					blocks: [{ ...PARAGRAPH, text: 'Lines: {{order.lines}}' }, FOOTER],
				},
			},
		}
		const data = { order: { number: '#1', lines: [{ sku: 'a' }] } }
		expect(
			tokenChecks(content, data).map((check) => [
				check.key.split('.').at(-1),
				check.params,
			]),
		).toEqual([
			['invalid_token', { locale: 'EN', token: '{{ order number }}' }],
			['token_not_text', { path: 'order' }],
			['token_not_text', { path: 'order.lines' }],
		])
	})
})
