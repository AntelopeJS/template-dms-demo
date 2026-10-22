// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	createApp,
	defineAsyncComponent,
	defineComponent,
	h,
	nextTick,
	reactive,
} from 'vue'
import EditorBlockList from '../app/components/editor/EditorBlockList.vue'
import type { Block } from '../app/types/mailing'

const editor = vi.hoisted(() => ({ touch: vi.fn(), select: vi.fn() }))
const sortables = vi.hoisted(
	() => [] as { el: HTMLElement; options: Record<string, unknown> }[],
)

// What SortableJS would be handed: the test calls it as SortableJS does.
vi.mock('@vueuse/integrations/useSortable', async () => {
	const { onMounted, unref } = await import('vue')
	return {
		useSortable: (
			target: { value: HTMLElement },
			_list: unknown,
			options: Record<string, unknown>,
		) => {
			onMounted(() => sortables.push({ el: unref(target), options }))
			return { option: () => {} }
		},
	}
})

vi.mock('../app/composables/useEditorContext', () => ({
	useEditorContext: () => ({ editor }),
}))

vi.mock('../app/components/editor/EditorInsertPoint.vue', () => ({
	default: defineComponent({ setup: () => () => h('span') }),
}))

vi.mock('../app/components/editor/EditorBlock.vue', () => ({
	default: defineComponent({
		props: ['block'],
		setup: (props) => () => h('div', { 'data-block': props.block.id }),
	}),
}))

afterEach(() => vi.unstubAllGlobals())

describe('editor draggable items', () => {
	it('mounts item elements before globally registered async blocks resolve', async () => {
		vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
		const list = reactive<Block[]>([
			{ id: 'first', type: 'divider', visibleIf: null },
			{ id: 'second', type: 'divider', visibleIf: null },
		])
		const errors: unknown[] = []
		const host = document.createElement('div')
		const app = createApp(EditorBlockList, { list })
		app.component(
			'MailingEditorBlock',
			defineAsyncComponent(() => new Promise(() => {})),
		)
		app.config.errorHandler = (error) => errors.push(error)
		try {
			app.mount(host)
			await nextTick()
			expect(errors).toEqual([])
			expect(
				[...host.querySelectorAll('[data-block]')].map((item) =>
					item.getAttribute('data-block'),
				),
			).toEqual(['first', 'second'])
		} finally {
			app.unmount()
		}
	})
	it('selects a block dropped into the list', async () => {
		vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
		sortables.length = 0
		const source = reactive<Block[]>([
			{ id: 'dropped', type: 'divider', visibleIf: null },
		])
		const target = reactive<Block[]>([])
		const app = createApp({
			render: () => [
				h(EditorBlockList, { list: source }),
				h(EditorBlockList, { list: target }),
			],
		})
		app.mount(document.createElement('div'))
		try {
			const [from, to] = sortables
			expect(from!.options).toMatchObject({
				group: { name: 'mailing-blocks' },
				handle: '.mailing-drag-handle',
				draggable: '>[data-drag-item]',
			})
			const item = from!.el.querySelector('[data-drag-item]') as HTMLElement
			const handler = (sortable: typeof from, name: string) =>
				sortable!.options[name] as (event: unknown) => void
			handler(from, 'onStart')({ item, oldIndex: 0 })
			to!.el.prepend(item)
			handler(to, 'onAdd')({ item, newIndex: 0 })
			handler(from, 'onRemove')({ item, oldIndex: 0 })
			handler(from, 'onEnd')({})
			await nextTick()
			expect(source).toEqual([])
			expect(target.map((block) => block.id)).toEqual(['dropped'])
			expect(editor.touch).toHaveBeenCalledTimes(2)
			expect(editor.select).toHaveBeenCalledExactlyOnceWith('dropped')
		} finally {
			app.unmount()
		}
	})
})
