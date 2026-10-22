// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VNode } from 'vue'

interface RegisteredType {
	id: string
	formatter: { default: (...args: unknown[]) => VNode }
}

type PluginSetup = () => void

const registered: RegisteredType[] = []

beforeEach(() => {
	registered.length = 0
	vi.stubGlobal('defineDmsPlugin', (setup: PluginSetup) => setup)
	vi.stubGlobal('useDataTypes', () => ({
		registerDataType: (type: RegisteredType) => registered.push(type),
	}))
	vi.stubGlobal('useUniqueLocales', () => ({
		uniqueLocales: { value: [{ code: 'en' }, { code: 'fr' }, { code: 'de' }] },
	}))
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

function texts(node: VNode): string[] {
	if (typeof node.children === 'string') return [node.children]
	if (!Array.isArray(node.children)) return []
	return (node.children as (VNode | string)[]).flatMap((child) =>
		typeof child === 'string' ? [child] : texts(child),
	)
}

describe('column displays plugin', () => {
	it('registers the locale chips and category displays without a DOM', async () => {
		const { default: setup } = await import('../app/plugins/column-displays')
		;(setup as unknown as PluginSetup)()
		expect(registered.map((type) => type.id)).toEqual([
			'mailing:locale-chips',
			'mailing:category',
		])
	})

	it('draws a category through its label component', async () => {
		const { renderCategory } = await import('../app/plugins/column-displays')
		const { default: CategoryLabel } =
			await import('../app/components/CategoryLabel.vue')
		const cell = renderCategory('orders')
		expect(cell.type).toBe(CategoryLabel)
		expect(cell.props).toEqual({ value: 'orders' })
		expect(renderCategory(undefined).props).toEqual({ value: null })
	})

	it('draws the locale chips with the missing workspace ones dashed', async () => {
		const { default: setup } = await import('../app/plugins/column-displays')
		;(setup as unknown as PluginSetup)()
		const cell = registered[0]!.formatter.default('en,fr', 'en')
		const chips = cell.children as VNode[]
		expect(chips.map((chip) => chip.children)).toEqual(['en', 'fr', 'de'])
		expect(String(chips[2]!.props?.class)).toContain('border-dashed')
		expect(String(chips[0]!.props?.class)).not.toContain('border-dashed')
	})

	it('draws a dash for a row without locale information', async () => {
		const { renderLocaleChips } = await import('../app/plugins/column-displays')
		expect(texts(renderLocaleChips('', ['en']))).toEqual(['—'])
		expect(texts(renderLocaleChips(undefined, ['en']))).toEqual(['—'])
	})
})
