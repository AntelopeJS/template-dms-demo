import { describe, expect, it } from 'vitest'
import { createEditorState } from '../app/composables/useTemplateEditor'
import type { Block, TemplateContent } from '../app/types/mailing'
import { HISTORY_COALESCE_MS } from '../app/utils/history'

const CONTENT: TemplateContent = {
	locales: {
		en: {
			subject: 'S',
			preheader: '',
			blocks: [
				{
					id: 'h1',
					type: 'heading',
					text: 'Hi',
					align: 'left',
					size: 23,
					visibleIf: null,
				},
			],
		},
	},
}

function steppingClock() {
	let now = 0
	return () => (now += HISTORY_COALESCE_MS)
}

describe('editor state', () => {
	it('starts clean on the requested locale and tracks dirtiness', () => {
		const state = createEditorState(CONTENT, 'en', ['en', 'fr'])
		expect(state.locale).toBe('en')
		expect(state.dirty).toBe(0)
		state.updateBlock('h1', { text: 'Hello' })
		expect(state.dirty).toBe(1)
		expect(state.current?.blocks[0]).toMatchObject({ text: 'Hello' })
	})
	it('selects a block and opens the Block tab of the inspector', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		state.rightTab = 'template'
		state.select('h1')
		expect(state.selected?.id).toBe('h1')
		expect(state.rightTab).toBe('block')
		state.select(null)
		expect(state.selected).toBeNull()
	})
	it('reports missing locales and creates one from a source locale', () => {
		const state = createEditorState(CONTENT, 'fr', ['en', 'fr'])
		expect(state.current).toBeNull()
		expect(state.missingLocales).toEqual(['fr'])
		state.createLocale('fr', 'en')
		expect(state.current?.subject).toBe('S')
		expect(state.current?.blocks[0]?.id).not.toBe('h1')
	})
	it('removes the selected block and clears the selection', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		state.select('h1')
		state.removeBlockById('h1')
		expect(state.current?.blocks).toHaveLength(0)
		expect(state.selectedId).toBeNull()
		expect(state.dirty).toBe(1)
	})
	it('adds a block under the selected one, inside branches too', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		const branch = state.addBlock('if')
		const nested = state.addBlock('paragraph', {
			parentId: branch.id,
			branch: 'children',
		})
		state.select(nested.id)
		state.addBlockUnderSelected('button')
		const found = state.findBlock(branch.id)
		expect(found?.type === 'if' && found.children.map((b) => b.type)).toEqual([
			'paragraph',
			'button',
		])
		state.select('h1')
		state.addBlockUnderSelected('divider')
		expect(state.current?.blocks.map((block) => block.type)).toEqual([
			'heading',
			'divider',
			'if',
		])
	})
	it('duplicates and moves blocks by id', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		state.duplicateBlockById('h1')
		const copyId = state.selectedId
		expect(copyId).not.toBe('h1')
		state.moveBlockById(copyId as string, -1)
		expect(state.current?.blocks[0]?.id).toBe(copyId)
	})
	it('switches the else branch on and off', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		const branch = state.addBlock('if')
		state.setElse(branch.id, true)
		const found = () => state.findBlock(branch.id)
		expect(found()?.type === 'if' && found()?.elseChildren).toHaveLength(1)
		state.setElse(branch.id, false)
		expect(found()?.type === 'if' && found()?.elseChildren).toBeNull()
	})
	it('marks only the revision a save captured as saved', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		state.updateBlock('h1', { text: 'A' })
		const captured = state.revision
		state.updateBlock('h1', { text: 'B' })
		state.markSaved(captured)
		expect(state.dirty).toBe(1)
		state.markSaved()
		expect(state.dirty).toBe(0)
	})
	it('undoes and redoes changes, each one bumping the revision', () => {
		const state = createEditorState(CONTENT, 'en', ['en'], steppingClock())
		state.updateBlock('h1', { text: 'One' })
		state.updateBlock('h1', { text: 'Two' })
		expect(state.canUndo).toBe(true)
		state.undo()
		expect(state.current?.blocks[0]).toMatchObject({ text: 'One' })
		state.undo()
		expect(state.current?.blocks[0]).toMatchObject({ text: 'Hi' })
		expect(state.canUndo).toBe(false)
		state.redo()
		expect(state.current?.blocks[0]).toMatchObject({ text: 'One' })
		expect(state.dirty).toBeGreaterThan(0)
	})
	it('drops the selection when an undo removes the selected block', () => {
		const state = createEditorState(CONTENT, 'en', ['en'], steppingClock())
		const added = state.addBlock('divider')
		expect(state.selectedId).toBe(added.id)
		state.undo()
		expect(state.selectedId).toBeNull()
	})
	it('resets to new content with an empty history', () => {
		const state = createEditorState(CONTENT, 'en', ['en'], steppingClock())
		state.updateBlock('h1', { text: 'Changed' })
		state.reset(CONTENT)
		expect(state.dirty).toBe(0)
		expect(state.canUndo).toBe(false)
		expect(state.current?.blocks[0]).toMatchObject({ text: 'Hi' })
	})
	it('opens the block search on the Blocks tab', () => {
		const state = createEditorState(CONTENT, 'en', ['en'])
		state.leftTab = 'outline'
		state.requestSearch()
		expect(state.leftTab).toBe('blocks')
		expect(state.isSearchRequested).toBe(true)
	})
	it('switches to the locale an undo changes and announces it', () => {
		const content: TemplateContent = {
			locales: { ...CONTENT.locales, fr: { ...CONTENT.locales.en! } },
		}
		const state = createEditorState(
			content,
			'en',
			['en', 'fr'],
			steppingClock(),
		)
		state.updateBlock('h1', { text: 'Changed' })
		state.setLocale('fr')
		state.undo()
		expect(state.locale).toBe('en')
		expect(state.current?.blocks[0]).toMatchObject({ text: 'Hi' })
		expect(state.announcement).toMatchObject({
			kind: 'undone_in_locale',
			locale: 'en',
		})
		state.redo()
		expect(state.announcement?.kind).toBe('undone_in_locale')
	})
	it('adds a block above the footer when nothing is selected', () => {
		const footer: Block = {
			id: 'f1',
			type: 'footer',
			text: '',
			unsubscribeLabel: 'Unsubscribe',
			preferencesLabel: 'Preferences',
			visibleIf: null,
		}
		const content: TemplateContent = {
			locales: { en: { subject: '', preheader: '', blocks: [footer] } },
		}
		const state = createEditorState(content, 'en', ['en'])
		state.addBlockUnderSelected('heading')
		expect(state.current?.blocks.map((block) => block.type)).toEqual([
			'heading',
			'footer',
		])
	})
	it('starts an empty locale with its own footer, translates a copy', () => {
		const state = createEditorState(CONTENT, 'en', ['en', 'fr', 'de'])
		state.addBlock('footer')
		state.createLocale('fr', 'en')
		expect(state.current?.blocks[1]).toMatchObject({
			unsubscribeLabel: 'Se désinscrire',
		})
		state.createLocale('de')
		expect(state.current?.blocks).toEqual([
			expect.objectContaining({
				type: 'footer',
				unsubscribeLabel: 'Unsubscribe',
			}),
		])
	})
	it('starts an empty locale of a transactional template without footer links', () => {
		const state = createEditorState(CONTENT, 'en', ['en', 'fr', 'de'])
		state.createLocale('fr', undefined, { category: 'orders' })
		expect(state.current?.blocks).toEqual([
			expect.objectContaining({
				type: 'footer',
				unsubscribeLabel: '',
				preferencesLabel: '',
			}),
		])
		state.createLocale('de', undefined, { category: 'marketing' })
		expect(state.current?.blocks[0]).toMatchObject({
			unsubscribeLabel: 'Unsubscribe',
		})
	})
	it('announces a deletion with its inner blocks and selects the neighbour', () => {
		const state = createEditorState(CONTENT, 'en', ['en'], steppingClock())
		const branch = state.addBlock('if')
		state.addBlock('paragraph', { parentId: branch.id, branch: 'children' })
		state.select(branch.id)
		state.removeBlockById(branch.id)
		expect(state.selectedId).toBe('h1')
		expect(state.announcement).toMatchObject({
			kind: 'block_removed',
			blockType: 'if',
			count: 1,
		})
		state.undoIfLatest(state.announcement?.undoable as string)
		expect(state.findBlock(branch.id)).not.toBeNull()
	})
	it('renames a variable through the content as one undoable step', () => {
		const declared = [{ path: 'name', type: 'string' as const, required: true }]
		const state = createEditorState(
			CONTENT,
			'en',
			['en'],
			steppingClock(),
			declared,
		)
		state.updateBlock('h1', { text: 'Hi {{ name }}' })
		state.setVariables([{ ...declared[0]!, path: 'first_name' }], {
			from: 'name',
			to: 'first_name',
		})
		expect(state.current?.blocks[0]).toMatchObject({
			text: 'Hi {{first_name}}',
		})
		expect(state.variables.map((variable) => variable.path)).toEqual([
			'first_name',
		])
		state.undo()
		expect(state.current?.blocks[0]).toMatchObject({ text: 'Hi {{ name }}' })
		expect(state.variables).toEqual(declared)
	})
	it('keeps the declarations in the draft: saved, undone and redone with it', () => {
		const state = createEditorState(CONTENT, 'en', ['en'], steppingClock())
		state.markSaved()
		state.setVariables([{ path: 'order.id', type: 'string', required: true }])
		expect(state.dirty).toBeGreaterThan(0)
		state.undo()
		expect(state.variables).toEqual([])
		state.redo()
		expect(state.variables).toEqual([
			{ path: 'order.id', type: 'string', required: true },
		])
		state.reset(CONTENT, [])
		expect(state.variables).toEqual([])
		expect(state.canUndo).toBe(false)
	})
})
