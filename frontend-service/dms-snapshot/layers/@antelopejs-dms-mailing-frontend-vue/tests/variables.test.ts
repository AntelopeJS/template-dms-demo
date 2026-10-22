import { describe, expect, it } from 'vitest'
import {
	countPathUsages,
	inferVariableType,
	isValidVariablePath,
	mergeVariables,
	renameVariablePath,
	suggestVariablePath,
} from '../app/utils/variables'
import type { TemplateContent, VariableDefinition } from '../app/types/mailing'

const DECLARED: VariableDefinition[] = [
	{ path: 'order.total', type: 'money', required: true },
	{ path: 'legacy.path', type: 'string', required: false },
]

describe('mergeVariables', () => {
	it('enriches a detected path with its declaration', () => {
		const merged = mergeVariables(['order.total'], DECLARED)
		expect(merged[0]).toEqual({
			path: 'order.total',
			type: 'money',
			required: true,
			usage: 'declared',
		})
	})

	it('gives a detected path with no declaration a neutral default', () => {
		const merged = mergeVariables(['customer.firstName'], [])
		expect(merged[0]).toEqual({
			path: 'customer.firstName',
			type: 'string',
			required: false,
			usage: 'detected',
		})
	})

	it('lists a declared path the content no longer uses as unused, last', () => {
		const merged = mergeVariables(['order.total'], DECLARED)
		expect(merged.map((entry) => entry.path)).toEqual([
			'order.total',
			'legacy.path',
		])
		expect(merged[1]?.usage).toBe('unused')
	})

	it('answers the declarations alone when nothing is detected', () => {
		expect(mergeVariables([], DECLARED).map((entry) => entry.usage)).toEqual([
			'unused',
			'unused',
		])
	})
})

function usingContent(): TemplateContent {
	return {
		locales: {
			en: {
				subject: 'Order {{ order.id }}',
				preheader: '',
				blocks: [
					{
						id: 'p1',
						type: 'paragraph',
						text: 'Total {{order.total}}, again {{ order.total }}',
						align: 'left',
						visibleIf: { path: 'order.total', operator: 'gt', value: '0' },
					},
					{
						id: 'if1',
						type: 'if',
						condition: { path: 'contact.vip', operator: 'truthy', value: '' },
						children: [
							{
								id: 'l1',
								type: 'list',
								source: 'order.lines',
								labelPath: 'label',
								valuePath: 'total',
								visibleIf: null,
							},
						],
						elseChildren: null,
						visibleIf: null,
					},
				],
			},
			fr: {
				subject: '',
				preheader: '{{order.total}}',
				blocks: [
					{ id: 'c1', type: 'code', text: '{{order.totals}}', visibleIf: null },
				],
			},
		},
	}
}

describe('variable paths in the content', () => {
	it('validates a path and suggests a valid one', () => {
		expect(isValidVariablePath('first name')).toBe(false)
		expect(isValidVariablePath('order.lines[]')).toBe(true)
		expect(suggestVariablePath('first name')).toBe('first_name')
		expect(suggestVariablePath(' -- ')).toBe('first_name')
	})
	it('counts the blocks and envelope fields using a path, every locale', () => {
		expect(countPathUsages(usingContent(), 'order.total')).toBe(2)
		expect(countPathUsages(usingContent(), 'order.lines')).toBe(1)
		expect(countPathUsages(usingContent(), 'contact.vip')).toBe(1)
		expect(countPathUsages(usingContent(), 'nothing')).toBe(0)
	})
	it('renames tokens, conditions and list sources in every locale', () => {
		const content = usingContent()
		renameVariablePath(content, 'order.total', 'order.amount')
		renameVariablePath(content, 'order.lines', 'cart.items')
		const [paragraph, branch] = content.locales.en!.blocks
		expect(paragraph).toMatchObject({
			text: 'Total {{order.amount}}, again {{order.amount}}',
			visibleIf: { path: 'order.amount' },
		})
		expect(branch?.type === 'if' && branch.children[0]).toMatchObject({
			source: 'cart.items',
		})
		expect(content.locales.fr).toMatchObject({
			preheader: '{{order.amount}}',
			blocks: [{ text: '{{order.totals}}' }],
		})
	})
	it('infers the type a declaration likely has', () => {
		expect(inferVariableType(usingContent(), 'order.lines')).toBe('array')
		expect(inferVariableType(usingContent(), 'contact.vip')).toBe('boolean')
		expect(inferVariableType(usingContent(), 'order.total')).toBe('string')
	})
})
