import { describe, expect, it } from 'vitest'
import {
	createBlock,
	duplicateBlock,
	findBlock,
	findParentList,
	insertionAfter,
	localizeFooters,
	moveBlock,
	neighbourOf,
	removeBlock,
} from '../app/utils/blocks'
import type { Block, FooterBlock, IfBlock } from '../app/types/mailing'

function tree(): Block[] {
	const branch = createBlock('if') as IfBlock
	branch.id = 'if1'
	branch.children = [{ ...createBlock('paragraph'), id: 'p1' }]
	return [
		{ ...createBlock('heading'), id: 'h1' },
		branch,
		{ ...createBlock('footer'), id: 'f1' },
	]
}

describe('block tree', () => {
	it('finds nested blocks and their parent list', () => {
		const blocks = tree()
		expect(findBlock(blocks, 'p1')?.type).toBe('paragraph')
		expect(findParentList(blocks, 'p1')).toBe((blocks[1] as IfBlock).children)
		expect(findParentList(blocks, 'h1')).toBe(blocks)
		expect(findBlock(blocks, 'nope')).toBeNull()
	})
	it('moves within the parent list and clamps at the edges', () => {
		const blocks = tree()
		expect(moveBlock(blocks, 'f1', -1)).toBe(true)
		expect(blocks.map((block) => block.id)).toEqual(['h1', 'f1', 'if1'])
		expect(moveBlock(blocks, 'h1', -1)).toBe(false)
	})
	it('duplicates right after the source with fresh ids (deep)', () => {
		const blocks = tree()
		const copy = duplicateBlock(blocks, 'if1')
		expect(copy?.id).not.toBe('if1')
		expect(copy?.type === 'if' && copy.children[0]?.id).not.toBe('p1')
		expect(blocks[2]).toBe(copy)
	})
	it('removes nested blocks', () => {
		const blocks = tree()
		expect(removeBlock(blocks, 'p1')).toBe(true)
		expect((blocks[1] as IfBlock).children).toEqual([])
	})
})

describe('insertion and removal helpers', () => {
	it('adds above the closing footer when nothing is selected', () => {
		const blocks = tree()
		expect(insertionAfter(blocks, null, 'heading').index).toBe(2)
		expect(insertionAfter(blocks, null, 'footer').index).toBe(3)
		expect(insertionAfter(blocks.slice(0, 2), null).index).toBe(2)
	})
	it('picks the next sibling, the previous one, then the parent condition', () => {
		const blocks = tree()
		expect(neighbourOf(blocks, 'h1')).toBe('if1')
		expect(neighbourOf(blocks, 'f1')).toBe('if1')
		expect(neighbourOf(blocks, 'p1')).toBe('if1')
		expect(neighbourOf(blocks, 'missing')).toBeNull()
	})
	it('translates the default footer labels and keeps typed ones', () => {
		const blocks = tree()
		const footer = blocks[2] as FooterBlock
		footer.preferencesLabel = 'My settings'
		localizeFooters(blocks, 'en', 'fr')
		expect(footer.unsubscribeLabel).toBe('Se désinscrire')
		expect(footer.preferencesLabel).toBe('My settings')
	})
})
