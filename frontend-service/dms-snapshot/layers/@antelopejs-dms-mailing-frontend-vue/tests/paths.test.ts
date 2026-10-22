import { describe, expect, it } from 'vitest'
import type { Block } from '../app/types/mailing'
import {
	collectContentPaths,
	collectPaths,
	isPresent,
	pathBreakSegments,
	pathsInBlocks,
	readPath,
} from '../app/utils/paths'

const blocks: Block[] = [
	{
		id: 'h1',
		type: 'heading',
		text: 'Hi {{customer.firstName}}',
		align: 'left',
		size: 23,
		visibleIf: null,
	},
	{
		id: 'if1',
		type: 'if',
		condition: { path: 'order.hasGift', operator: 'truthy', value: '' },
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
		visibleIf: { path: 'contact.isPro', operator: 'truthy', value: '' },
	},
]

describe('paths', () => {
	it('collects every variable path used by the content', () => {
		expect(pathsInBlocks(blocks).sort()).toEqual([
			'contact.isPro',
			'customer.firstName',
			'order.hasGift',
			'order.lines',
		])
	})
	it('merges declared paths, used paths and the current one, deduplicated', () => {
		expect(
			collectPaths(['customer.firstName', 'invoice.ref'], blocks, 'ad.hoc'),
		).toEqual([
			'ad.hoc',
			'contact.isPro',
			'customer.firstName',
			'invoice.ref',
			'order.hasGift',
			'order.lines',
		])
	})
})

const localeContent = (subject: string, blocks: Block[]) => ({
	subject,
	preheader: '',
	blocks,
})

describe('collectContentPaths', () => {
	// The variables panel marks a declared path "unused" when nothing references
	// it. Its detected list comes from the server and only refreshes on save, so
	// a path wired into a condition read as unused until then. This is the live
	// equivalent, and it has to see every source the backend sees.
	it('sees a path used only by a display condition', () => {
		const content = {
			locales: {
				en: localeContent('Hello', [
					{
						id: 'b',
						type: 'button',
						text: 'Go',
						href: '#',
						align: 'left',
						visibleIf: { path: 'order.mix', operator: 'truthy', value: '' },
					},
				] as Block[]),
			},
		}
		expect(collectContentPaths(content)).toContain('order.mix')
	})

	it('unions every locale, so a path used in one is not unused in another', () => {
		const content = {
			locales: {
				en: localeContent('Hi {{customer.firstName}}', []),
				fr: localeContent('Bonjour {{contact.civility}}', []),
			},
		}
		expect(collectContentPaths(content)).toEqual([
			'contact.civility',
			'customer.firstName',
		])
	})

	it('reads the subject and the preheader, not just the blocks', () => {
		const content = {
			locales: {
				en: {
					subject: '{{a.one}}',
					preheader: '{{a.two}}',
					blocks: [] as Block[],
				},
			},
		}
		expect(collectContentPaths(content)).toEqual(['a.one', 'a.two'])
	})

	// The backend drops these before answering, so the panel must too or they
	// would show up as undeclared variables nobody can declare.
	it('drops the system paths the runtime fills in', () => {
		const content = {
			locales: {
				en: localeContent(
					'{{unsubscribeUrl}} {{preferencesUrl}} {{real.one}}',
					[],
				),
			},
		}
		expect(collectContentPaths(content)).toEqual(['real.one'])
	})
})

describe('readPath', () => {
	it('reads nested values and array paths like the engine', () => {
		const data = { order: { lines: [1, 2], total: 0, note: null } }
		expect(readPath(data, 'order.total')).toBe(0)
		expect(readPath(data, 'order.lines[]')).toEqual([1, 2])
		expect(readPath(data, ' order.missing.deep ')).toBeUndefined()
		expect(readPath(data, 'constructor')).toBeUndefined()
		expect(isPresent(readPath(data, 'order.note'))).toBe(false)
		expect(isPresent(readPath(data, 'order.total'))).toBe(true)
	})
})

describe('pathBreakSegments', () => {
	it('cuts a path after each dot, so it wraps between names', () => {
		expect(pathBreakSegments('order.number')).toEqual(['order.', 'number'])
		expect(pathBreakSegments('items[].name')).toEqual(['items[].', 'name'])
		expect(pathBreakSegments('firstName')).toEqual(['firstName'])
	})
})
