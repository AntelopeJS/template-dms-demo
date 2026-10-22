import { describe, expect, it } from 'vitest'
import type { FooterBlock, LocaleContent } from '../app/types/mailing'
import {
	contentSystemPaths,
	hasFooterLinksByDefault,
	hasSystemUrl,
	systemVariableChecks,
	systemVariables,
} from '../app/utils/system-variables'
import { createBlock } from '../app/utils/blocks/factory'

const footer = (overrides: Partial<FooterBlock> = {}): FooterBlock => ({
	id: 'f',
	type: 'footer',
	text: '',
	unsubscribeLabel: 'Unsubscribe',
	preferencesLabel: 'Preferences',
	visibleIf: null,
	...overrides,
})

const page = (block: FooterBlock, subject = 'Hello'): LocaleContent => ({
	subject,
	preheader: '',
	blocks: [block],
})

const content = (block: FooterBlock, subject?: string) => ({
	locales: { en: page(block, subject) },
})

describe('contentSystemPaths', () => {
	it('declares the URL of every footer link with a label', () => {
		expect(contentSystemPaths(content(footer()))).toEqual([
			'unsubscribeUrl',
			'preferencesUrl',
		])
		expect(
			contentSystemPaths(content(footer({ unsubscribeLabel: '  ' }))),
		).toEqual(['preferencesUrl'])
	})

	it('counts a system URL used as a token', () => {
		const bare = footer({ unsubscribeLabel: '', preferencesLabel: '' })
		expect(
			contentSystemPaths(content(bare, 'Leave: {{unsubscribeUrl}}')),
		).toEqual(['unsubscribeUrl'])
	})

	it('finds a footer inside a condition', () => {
		const nested = {
			locales: {
				en: {
					subject: '',
					preheader: '',
					blocks: [
						{
							id: 'if',
							type: 'if' as const,
							condition: { path: 'x', operator: 'truthy' as const, value: '' },
							children: [footer({ preferencesLabel: '' })],
							elseChildren: null,
							visibleIf: null,
						},
					],
				},
			},
		}
		expect(contentSystemPaths(nested)).toEqual(['unsubscribeUrl'])
	})
})

describe('systemVariables', () => {
	it('types them as urls, required for a marketing template only', () => {
		expect(systemVariables(content(footer()), 'marketing')).toEqual([
			{ path: 'unsubscribeUrl', type: 'url', required: true, system: true },
			{ path: 'preferencesUrl', type: 'url', required: true, system: true },
		])
		expect(
			systemVariables(content(footer()), 'orders').map((v) => v.required),
		).toEqual([false, false])
	})
})

describe('systemVariableChecks', () => {
	it('warns about a marketing locale without an unsubscribe link', () => {
		const bare = footer({ unsubscribeLabel: '' })
		const checks = systemVariableChecks(content(bare), 'marketing', {
			preferencesUrl: 'https://p',
		})
		expect(checks.map((check) => check.key)).toEqual([
			'dms_mailing.editor.checks.marketing_no_unsubscribe',
		])
		expect(checks[0]?.params).toEqual({ locale: 'EN' })
	})

	it('warns about a required URL the test data lacks', () => {
		const checks = systemVariableChecks(content(footer()), 'marketing', {
			unsubscribeUrl: 'https://u',
		})
		expect(checks.map((check) => check.id)).toEqual(['system-preferencesUrl'])
	})

	it('stays quiet for a transactional template', () => {
		expect(systemVariableChecks(content(footer()), 'orders', {})).toEqual([])
	})
})

describe('footer links by category', () => {
	it('keeps the links of uncategorised and marketing footers only', () => {
		expect(hasFooterLinksByDefault(null)).toBe(true)
		expect(hasFooterLinksByDefault('marketing')).toBe(true)
		expect(hasFooterLinksByDefault('billing')).toBe(false)
	})

	it('creates a transactional footer without links', () => {
		const block = createBlock('footer', { locale: 'fr', category: 'orders' })
		expect(block).toMatchObject({ unsubscribeLabel: '', preferencesLabel: '' })
		const marketing = createBlock('footer', {
			locale: 'fr',
			category: 'marketing',
		})
		expect(marketing).toMatchObject({ unsubscribeLabel: 'Se désinscrire' })
	})

	it('reads a URL from preview data', () => {
		expect(
			hasSystemUrl({ unsubscribeUrl: 'https://u' }, 'unsubscribeUrl'),
		).toBe(true)
		expect(hasSystemUrl({ unsubscribeUrl: ' ' }, 'unsubscribeUrl')).toBe(false)
		expect(hasSystemUrl(null, 'unsubscribeUrl')).toBe(false)
	})
})
