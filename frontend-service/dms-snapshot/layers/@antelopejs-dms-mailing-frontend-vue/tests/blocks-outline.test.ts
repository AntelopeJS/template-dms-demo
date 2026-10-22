import { describe, expect, it } from 'vitest'
import {
	blockPosition,
	branchCounts,
	buildOutline,
	filterPalette,
	flattenBlocks,
	insertionAfter,
	paletteLabelKey,
	summarizeBlock,
	BLOCK_PALETTE,
} from '../app/utils/blocks'
import type { Block, IfBlock } from '../app/types/mailing'

const branch: IfBlock = {
	id: 'if1',
	type: 'if',
	condition: { path: 'order.isFirstOrder', operator: 'truthy', value: '' },
	children: [{ id: 'c1', type: 'code', text: 'WELCOME10', visibleIf: null }],
	elseChildren: [
		{
			id: 'p2',
			type: 'paragraph',
			text: 'Thanks for ordering again, see you soon',
			align: 'left',
			visibleIf: null,
		},
	],
	visibleIf: null,
}

const BLOCKS: Block[] = [
	{
		id: 'h1',
		type: 'heading',
		text: 'Thanks',
		align: 'left',
		size: 23,
		visibleIf: null,
	},
	branch,
	{ id: 'd1', type: 'divider', visibleIf: null },
]

describe('outline', () => {
	it('nests condition branches with an ELSE marker', () => {
		expect(
			buildOutline(BLOCKS).map((row) => [row.kind, row.blockId, row.depth]),
		).toEqual([
			['block', 'h1', 0],
			['block', 'if1', 0],
			['block', 'c1', 1],
			['else', 'if1', 1],
			['block', 'p2', 1],
			['block', 'd1', 0],
		])
	})
	it('summarises a block in a few characters', () => {
		expect(summarizeBlock(branch)).toBe('order.isFirstOrder')
		expect(summarizeBlock(branch.elseChildren![0]!)).toBe('Thanks for orderin…')
		expect(summarizeBlock(BLOCKS[2]!)).toBe('')
	})
})

describe('tree positions', () => {
	it('counts every block of the tree, depth first', () => {
		expect(flattenBlocks(BLOCKS).map((block) => block.id)).toEqual([
			'h1',
			'if1',
			'c1',
			'p2',
			'd1',
		])
		expect(blockPosition(BLOCKS, 'p2')).toEqual({ index: 4, total: 5 })
		expect(blockPosition(BLOCKS, 'nope')).toBeNull()
		expect(branchCounts(branch)).toEqual({ then: 1, else: 1 })
	})
	it('inserts after the selected block in its own list', () => {
		const point = insertionAfter(BLOCKS, 'c1')
		expect(point.list).toBe(branch.children)
		expect(point.index).toBe(1)
		expect(insertionAfter(BLOCKS, null)).toEqual({ list: BLOCKS, index: 3 })
	})
})

describe('palette', () => {
	it('filters tiles by label or type', () => {
		const labelOf = (entry: { type: string }) => `Label ${entry.type}`
		expect(
			filterPalette(BLOCK_PALETTE, 'HERO', labelOf).map((e) => e.type),
		).toEqual(['hero'])
		expect(filterPalette(BLOCK_PALETTE, '  ', labelOf)).toHaveLength(
			BLOCK_PALETTE.length,
		)
	})
	it('gives the footer and the condition their longer tile labels', () => {
		expect(paletteLabelKey('footer')).toBe(
			'dms_mailing.editor.palette.tiles.footer',
		)
		expect(paletteLabelKey('heading')).toBe('dms_mailing.blocks.heading')
	})
})
