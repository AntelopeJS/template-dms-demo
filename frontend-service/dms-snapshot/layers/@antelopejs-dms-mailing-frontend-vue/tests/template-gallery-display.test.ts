// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'

interface DisplayRegistration {
	id: string
	component: Component
}

type PluginSetup = () => void

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

describe('template gallery display plugin', () => {
	it('registers the gallery under the mailing namespace without a DOM', async () => {
		const registrations: DisplayRegistration[] = []
		vi.stubGlobal('defineDmsPlugin', (setup: PluginSetup) => setup)
		vi.stubGlobal(
			'registerTableViewDisplay',
			(registration: DisplayRegistration) => registrations.push(registration),
		)
		const { default: setup } =
			await import('../app/plugins/template-gallery-display')
		setup()
		expect(registrations.map((registration) => registration.id)).toEqual([
			'mailing:gallery',
		])
	})
})
