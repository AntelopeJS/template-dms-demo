// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isTypingTarget, matchShortcut } from '../app/utils/shortcuts'
import type { KeyStroke } from '../app/utils/shortcuts'

const stroke = (key: string, extra: Partial<KeyStroke> = {}): KeyStroke => ({
	key,
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	...extra,
})

describe('matchShortcut', () => {
	it('matches ⌘ and Ctrl alike for the modifier shortcuts', () => {
		expect(matchShortcut(stroke('s', { metaKey: true }), false)).toBe('save')
		expect(matchShortcut(stroke('s', { ctrlKey: true }), false)).toBe('save')
		expect(matchShortcut(stroke('Enter', { metaKey: true }), false)).toBe(
			'publish',
		)
		expect(matchShortcut(stroke('d', { ctrlKey: true }), false)).toBe(
			'duplicate',
		)
	})
	it('tells undo from redo by Shift', () => {
		expect(matchShortcut(stroke('z', { metaKey: true }), false)).toBe('undo')
		expect(
			matchShortcut(stroke('Z', { metaKey: true, shiftKey: true }), false),
		).toBe('redo')
		expect(matchShortcut(stroke('y', { ctrlKey: true }), false)).toBe('redo')
	})
	it('matches the single keys, whatever their case', () => {
		expect(matchShortcut(stroke('t'), false)).toBe('test')
		expect(matchShortcut(stroke('T', { shiftKey: true }), false)).toBe('test')
		expect(matchShortcut(stroke('/'), false)).toBe('search')
		expect(matchShortcut(stroke('Backspace'), false)).toBe('delete')
		expect(matchShortcut(stroke('Delete'), false)).toBe('delete')
		expect(matchShortcut(stroke('Escape'), false)).toBe('escape')
	})
	it('leaves single keys alone while typing, but keeps save and publish', () => {
		expect(matchShortcut(stroke('t'), true)).toBeNull()
		expect(matchShortcut(stroke('Backspace'), true)).toBeNull()
		expect(matchShortcut(stroke('Escape'), true)).toBeNull()
		expect(matchShortcut(stroke('z', { metaKey: true }), true)).toBeNull()
		expect(matchShortcut(stroke('s', { metaKey: true }), true)).toBe('save')
		expect(matchShortcut(stroke('Enter', { ctrlKey: true }), true)).toBe(
			'publish',
		)
	})
	it('ignores Alt combinations and unknown keys', () => {
		expect(
			matchShortcut(stroke('s', { metaKey: true, altKey: true }), false),
		).toBeNull()
		expect(matchShortcut(stroke('t', { metaKey: true }), false)).toBeNull()
		expect(matchShortcut(stroke('x'), false)).toBeNull()
	})
})

describe('isTypingTarget', () => {
	it('recognises text fields and editable content', () => {
		const input = document.createElement('input')
		const checkbox = document.createElement('input')
		checkbox.type = 'checkbox'
		const editable = document.createElement('div')
		editable.setAttribute('contenteditable', 'true')
		const child = document.createElement('span')
		editable.appendChild(child)
		expect(isTypingTarget(input)).toBe(true)
		expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
		expect(isTypingTarget(checkbox)).toBe(false)
		expect(isTypingTarget(child)).toBe(true)
		expect(isTypingTarget(document.createElement('button'))).toBe(false)
		expect(isTypingTarget(null)).toBe(false)
	})
})
