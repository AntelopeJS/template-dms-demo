import { describe, expect, it } from 'vitest'
import { BLOCK_TYPES } from '../app/types/mailing'
import { BLOCK_COMPONENT_NAMES } from '../app/utils/blocks/components'

describe('block components', () => {
	it('names a canvas renderer for every block type', () => {
		expect(Object.keys(BLOCK_COMPONENT_NAMES).sort()).toEqual(
			[...BLOCK_TYPES].sort(),
		)
	})
})
