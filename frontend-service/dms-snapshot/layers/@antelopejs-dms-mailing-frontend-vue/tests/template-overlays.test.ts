// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TemplateRow } from '../app/types/mailing'

interface OpenCall {
	title: string
	component: unknown
	componentOptions: Record<string, unknown>
	componentKey?: string
	direction?: string
	size?: string
}

interface Navigation {
	hasPrev: boolean
	hasNext: boolean
	next: () => void
}

const drawerCalls: OpenCall[] = []
const modalCalls: OpenCall[] = []
const patches: Record<string, unknown>[] = []
let nextResult: unknown = undefined

function handle() {
	return {
		result: Promise.resolve(nextResult),
		patch: (patch: Record<string, unknown>) => patches.push(patch),
		close: () => undefined,
	}
}

beforeEach(() => {
	drawerCalls.length = 0
	modalCalls.length = 0
	patches.length = 0
	nextResult = undefined
	vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
	vi.stubGlobal('resolveComponent', (name: string) => ({ name }))
	vi.stubGlobal('useDrawer', () => ({
		open: (options: OpenCall) => {
			drawerCalls.push(options)
			return handle()
		},
	}))
	vi.stubGlobal('useModal', () => ({
		open: (options: OpenCall) => {
			modalCalls.push(options)
			return handle()
		},
	}))
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

function row(id: string): TemplateRow {
	return {
		_id: id,
		slug: id,
		name: id,
		status: 'live',
		updatedAt: '',
		updatedBy: '',
	}
}

describe('useTemplateDrawer', () => {
	it('opens the test send with the editor draft and locale', async () => {
		const { useTemplateDrawer } =
			await import('../app/composables/useTemplateDrawer')
		const content = { locales: {} }
		useTemplateDrawer().openTestSend('t1', { locale: 'fr', content })
		expect(modalCalls[0]?.component).toEqual({ name: 'MailingTestSendModal' })
		expect(modalCalls[0]?.componentOptions).toEqual({
			templateId: 't1',
			locale: 'fr',
			content,
		})
	})

	it('calls back only when the dialog closes after a change', async () => {
		const { useTemplateDrawer } =
			await import('../app/composables/useTemplateDrawer')
		const onDone = vi.fn()
		useTemplateDrawer().openRealSend('t1', { onDone })
		await Promise.resolve()
		await Promise.resolve()
		expect(onDone).not.toHaveBeenCalled()
		nextResult = true
		useTemplateDrawer().openNewTemplate({ initialName: 'Refund', onDone })
		await Promise.resolve()
		await Promise.resolve()
		expect(onDone).toHaveBeenCalledTimes(1)
		expect(modalCalls[1]?.componentOptions).toEqual({ initialName: 'Refund' })
	})

	it('opens the details from the right and steps through the rows shown', async () => {
		const { useTemplateDrawer } =
			await import('../app/composables/useTemplateDrawer')
		const rows = [row('a'), row('b'), row('c')]
		useTemplateDrawer().openDetails(rows[1]!, { rows })
		const call = drawerCalls[0]!
		expect(call.direction).toBe('right')
		expect(call.component).toEqual({ name: 'MailingTemplateDrawer' })
		const navigation = call.componentOptions.navigation as Navigation
		expect(navigation.hasPrev).toBe(true)
		expect(navigation.hasNext).toBe(true)
		navigation.next()
		expect(patches[0]?.componentKey).toBe('c')
		const options = patches[0]?.componentOptions as Record<string, unknown>
		expect(options.templateId).toBe('c')
		expect((options.navigation as Navigation).hasNext).toBe(false)
	})

	it('opens the details of a bare id without navigation', async () => {
		const { useTemplateDrawer } =
			await import('../app/composables/useTemplateDrawer')
		useTemplateDrawer().openDetails('x')
		expect(drawerCalls[0]?.componentOptions.templateId).toBe('x')
		expect(drawerCalls[0]?.componentOptions.navigation).toBeUndefined()
	})
})
