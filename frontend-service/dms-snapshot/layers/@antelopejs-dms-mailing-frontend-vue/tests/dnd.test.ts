import { describe, expect, it } from 'vitest'
import { DRAG_GROUP, cloneFromPalette } from '../app/utils/blocks/dnd'

describe('dnd', () => {
	it('clones a palette entry into a fresh block', () => {
		const block = cloneFromPalette({ type: 'button', icon: 'x' })
		expect(block.type).toBe('button')
		expect(block.id).toMatch(/^button_/)
		expect(DRAG_GROUP.name).toBe('mailing-blocks')
	})
})

describe('cloneFromPalette', () => {
	it('shapes a dropped tile like a clicked one', () => {
		const block = cloneFromPalette(
			{ type: 'heading', icon: 'x' },
			{ locale: 'fr' },
		)
		expect(block).toMatchObject({ type: 'heading', text: 'Nouveau titre' })
	})
})
