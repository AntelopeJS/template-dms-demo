// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VariablePath from '../app/components/VariablePath.vue'
import { mount, stubNuxtGlobals } from './helpers/nuxt-globals'

describe('VariablePath', () => {
	beforeEach(() => {
		stubNuxtGlobals()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('reads as the path, with a wrap point after each dot only', () => {
		const { host, unmount } = mount(VariablePath, { path: 'order.number' })
		const code = host.querySelector('code')
		expect(code?.textContent).toBe('order.number')
		expect(code?.querySelectorAll('wbr')).toHaveLength(2)
		expect(code?.className).not.toContain('break-all')
		unmount()
	})
})
