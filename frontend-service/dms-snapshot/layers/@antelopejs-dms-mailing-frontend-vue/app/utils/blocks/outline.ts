import type { Block, BlockType } from '../../types/mailing'
import { BLOCK_ICONS } from './factory'

export type OutlineRowKind = 'block' | 'else'

/** One row of the Outline tab: a block, or the ELSE marker of a condition. */
export interface OutlineRow {
	key: string
	kind: OutlineRowKind
	blockId: string
	type: BlockType
	icon: string
	depth: number
	summary: string
}

const SUMMARY_LENGTH = 18
const ELLIPSIS = '…'
const ELSE_ICON = 'i-ph-arrow-elbow-down-right'
const ELSE_KEY_SUFFIX = ':else'

type Summarizer = (block: Block) => string

const field =
	(key: string): Summarizer =>
	(block) => {
		const value = (block as unknown as Record<string, unknown>)[key]
		return typeof value === 'string' ? value : ''
	}

const SUMMARIZERS: Record<BlockType, Summarizer> = {
	hero: (block) => field('alt')(block) || field('imageUrl')(block),
	heading: field('text'),
	paragraph: field('text'),
	code: field('text'),
	list: field('source'),
	total: field('value'),
	button: field('text'),
	if: (block) => (block.type === 'if' ? block.condition.path : ''),
	divider: () => '',
	footer: field('text'),
}

/** A short, single-line reading of a block's content. */
export function summarizeBlock(block: Block): string {
	const text = SUMMARIZERS[block.type](block).replace(/\s+/g, ' ').trim()
	return text.length > SUMMARY_LENGTH
		? `${text.slice(0, SUMMARY_LENGTH).trimEnd()}${ELLIPSIS}`
		: text
}

function blockRow(block: Block, depth: number): OutlineRow {
	return {
		key: block.id,
		kind: 'block',
		blockId: block.id,
		type: block.type,
		icon: BLOCK_ICONS[block.type],
		depth,
		summary: summarizeBlock(block),
	}
}

function elseRow(block: Block, depth: number): OutlineRow {
	return {
		key: `${block.id}${ELSE_KEY_SUFFIX}`,
		kind: 'else',
		blockId: block.id,
		type: block.type,
		icon: ELSE_ICON,
		depth,
		summary: '',
	}
}

function rowsOf(block: Block, depth: number): OutlineRow[] {
	if (block.type !== 'if') return [blockRow(block, depth)]
	const branches = buildOutline(block.children, depth + 1)
	if (!block.elseChildren) return [blockRow(block, depth), ...branches]
	return [
		blockRow(block, depth),
		...branches,
		elseRow(block, depth + 1),
		...buildOutline(block.elseChildren, depth + 1),
	]
}

/** The block tree as indented rows, condition branches nested. */
export function buildOutline(blocks: Block[], depth = 0): OutlineRow[] {
	return blocks.flatMap((block) => rowsOf(block, depth))
}
