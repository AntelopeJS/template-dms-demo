import type { Block } from '../../types/mailing'
import type { BlockContext, PaletteEntry } from './factory'
import { createBlock } from './factory'

export const DRAG_GROUP = { name: 'mailing-blocks' }
export const PALETTE_GROUP = {
	name: 'mailing-blocks',
	pull: 'clone' as const,
	put: false,
}
export const DRAG_HANDLE = '.mailing-drag-handle'
/** The blocks of a list, not the insert point that ends it. */
export const DRAG_ITEM = '>[data-drag-item]'

/** The block a tile dropped on the canvas becomes, shaped by its template. */
export function cloneFromPalette(
	entry: PaletteEntry,
	context: BlockContext = {},
): Block {
	return createBlock(entry.type, context)
}
