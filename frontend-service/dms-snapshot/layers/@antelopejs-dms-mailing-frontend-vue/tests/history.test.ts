import { describe, expect, it } from 'vitest'
import {
	HISTORY_COALESCE_MS,
	HISTORY_LIMIT,
	createHistory,
	recordChange,
	redoChange,
	undoChange,
} from '../app/utils/history'

describe('editor history', () => {
	it('records steps and walks back and forth', () => {
		const history = createHistory('a')
		recordChange(history, 'b', HISTORY_COALESCE_MS)
		recordChange(history, 'c', HISTORY_COALESCE_MS * 2)
		expect(undoChange(history)).toBe('b')
		expect(undoChange(history)).toBe('a')
		expect(undoChange(history)).toBeNull()
		expect(redoChange(history)).toBe('b')
		recordChange(history, 'd', HISTORY_COALESCE_MS * 10)
		expect(redoChange(history)).toBeNull()
	})
	it('merges quick successive changes into one step', () => {
		const history = createHistory('a')
		recordChange(history, 'ab', 1000)
		recordChange(history, 'abc', 1000 + HISTORY_COALESCE_MS / 2)
		expect(undoChange(history)).toBe('a')
	})
	it('ignores a change that leaves the content as it was', () => {
		const history = createHistory('a')
		recordChange(history, 'a', HISTORY_COALESCE_MS)
		expect(history.past).toEqual([])
	})
	it('keeps a bounded number of steps', () => {
		const history = createHistory('0')
		for (let step = 1; step <= HISTORY_LIMIT + 10; step += 1)
			recordChange(history, String(step), step * HISTORY_COALESCE_MS)
		expect(history.past).toHaveLength(HISTORY_LIMIT)
	})
	it('keeps a discrete change in a step of its own', () => {
		const history = createHistory('a')
		recordChange(history, 'b', HISTORY_COALESCE_MS)
		recordChange(history, 'c', HISTORY_COALESCE_MS + 1, true)
		recordChange(history, 'd', HISTORY_COALESCE_MS + 2)
		expect(history.past).toEqual(['a', 'b', 'c'])
		expect(undoChange(history)).toBe('c')
	})
})
