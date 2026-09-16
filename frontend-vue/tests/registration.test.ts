import { expect, it, vi } from 'vitest'
import frontendModule from '../dms.frontend'

it('registers every demo component under its Demo prefix', async () => {
	const registerComponent = vi.fn()
	await frontendModule.setup({
		options: { public: {} },
		registerComponent,
		registerPage: vi.fn(),
		registerDynamicPage: vi.fn(),
		registerLayout: vi.fn(),
		registerErrorPage: vi.fn(),
		registerPlugin: vi.fn(),
		registerMiddleware: vi.fn(),
		provide: vi.fn(),
		use: vi.fn(),
	})
	const names = registerComponent.mock.calls.map(([name]) => name)
	// The backend references these exact names through CustomComponent().
	expect(names).toEqual(['DemoCallout', 'DemoReadme'])
})
