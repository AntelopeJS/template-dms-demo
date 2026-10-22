import { describe, expect, it } from 'vitest'
import { describeChanges } from '../app/utils/changes'
import type { TemplateChange, TemplateContent } from '../app/types/mailing'

const DRAFT: TemplateContent = {
	locales: {
		en: {
			subject: 'S',
			preheader: '',
			blocks: [
				{
					id: 'if1',
					type: 'if',
					condition: {
						path: 'order.isFirstOrder',
						operator: 'truthy',
						value: '',
					},
					children: [],
					elseChildren: null,
					visibleIf: null,
				},
			],
		},
	},
}

const LABELS: Record<string, string> = {
	'dms_mailing.blocks.paragraph': 'Paragraph',
	'dms_mailing.blocks.if': 'Condition',
	'dms_mailing.editor.changes.block_changed': '{block} changed',
	'dms_mailing.editor.changes.block_added': '{block} added',
	'dms_mailing.editor.changes.subject': 'Subject changed',
	'dms_mailing.editor.changes.variable_added': '{variable} declared',
}

const translate = (key: string, params: Record<string, string> = {}) =>
	(LABELS[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')

describe('describeChanges', () => {
	it('reads a declaration change without a locale, naming its path', () => {
		const lines = describeChanges(
			[{ locale: '', kind: 'variable_added', variable: 'order.id' }],
			{ draft: DRAFT, published: null },
			translate,
		)
		expect(lines.map((line) => line.text)).toEqual(['order.id declared'])
		expect(lines[0]?.icon).toBe('i-ph-brackets-curly')
	})

	it('reads each change as a line prefixed with its locale', () => {
		const changes: TemplateChange[] = [
			{
				locale: 'en',
				kind: 'block_changed',
				blockId: 'p1',
				blockType: 'paragraph',
			},
			{ locale: 'en', kind: 'block_added', blockId: 'if1', blockType: 'if' },
			{ locale: 'fr', kind: 'subject' },
		]
		const lines = describeChanges(
			changes,
			{ draft: DRAFT, published: null },
			translate,
		)
		expect(lines.map((line) => line.text)).toEqual([
			'EN · Paragraph changed',
			'EN · Condition order.isFirstOrder added',
			'FR · Subject changed',
		])
		expect(lines[1]?.icon).toBe('i-ph-plus-circle')
		expect(new Set(lines.map((line) => line.key)).size).toBe(3)
	})
	it('names a removed condition from the published content', () => {
		const lines = describeChanges(
			[
				{
					locale: 'en',
					kind: 'block_removed',
					blockId: 'if1',
					blockType: 'if',
				},
			],
			{ draft: { locales: {} }, published: DRAFT },
			(key, params) => (params ? `${key}:${params.block}` : key),
		)
		expect(lines[0]?.text).toBe(
			'EN · dms_mailing.editor.changes.block_removed:dms_mailing.blocks.if order.isFirstOrder',
		)
	})
})

describe('describeChanges before / after', () => {
	const content = (subject: string, text: string): TemplateContent => ({
		locales: {
			fr: {
				subject,
				preheader: '',
				blocks: [
					{
						id: 'h1',
						type: 'heading',
						text,
						align: 'left',
						size: 24,
						visibleIf: null,
					},
				],
			},
		},
	})

	it('shows the text customers receive next to the draft one', () => {
		const lines = describeChanges(
			[
				{ locale: 'fr', kind: 'subject' },
				{
					locale: 'fr',
					kind: 'block_changed',
					blockId: 'h1',
					blockType: 'heading',
				},
			],
			{
				draft: content('Nouveau', 'Bonjour'),
				published: content('Ancien', 'Salut'),
			},
			translate,
		)
		expect(lines.map((line) => [line.before, line.after])).toEqual([
			['Ancien', 'Nouveau'],
			['Salut', 'Bonjour'],
		])
	})
})
