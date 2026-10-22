import { describe, expect, it } from 'vitest'
import {
	isSetupComplete,
	needsSetup,
	setupSteps,
	type SetupFacts,
} from '../app/utils/overview-setup'

const facts = (overrides: Partial<SetupFacts> = {}): SetupFacts => ({
	isProviderConnected: true,
	isSenderSet: true,
	liveTemplateCount: 1,
	hasTestSend: true,
	...overrides,
})

describe('setupSteps', () => {
	it('lists what the workspace still has to do, without a step always done', () => {
		const steps = setupSteps(
			facts({ isProviderConnected: false, liveTemplateCount: 0 }),
		)
		expect(steps.map((step) => step.id)).toEqual([
			'provider',
			'sender',
			'publish',
			'test',
		])
		expect(steps.map((step) => step.state)).toEqual([
			'current',
			'done',
			'todo',
			'done',
		])
		expect(steps.map((step) => step.number)).toEqual([1, 2, 3, 4])
	})

	it('links the sender step to its settings section', () => {
		const steps = setupSteps(facts({ isSenderSet: false }))
		expect(steps.find((step) => step.state === 'current')).toMatchObject({
			id: 'sender',
			to: '/modules/mailing/settings#dms-form-content-section-sender',
		})
	})

	// The provider is set in the project's configuration: no button leads to
	// a read-only field.
	it('offers no destination for the provider step', () => {
		const provider = setupSteps(facts({ isProviderConnected: false }))[0]
		expect(provider?.to).toBeUndefined()
	})

	it('ticks the template steps on a live template and a test send, not a draft', () => {
		const steps = setupSteps(
			facts({ liveTemplateCount: 0, hasTestSend: false }),
		)
		expect(
			steps.filter((step) => step.state !== 'done').map((step) => step.id),
		).toEqual(['publish', 'test'])
	})
})

describe('needsSetup', () => {
	it('holds the dashboard back until a provider and a live template exist', () => {
		expect(needsSetup(facts({ isProviderConnected: false }))).toBe(true)
		expect(needsSetup(facts({ liveTemplateCount: 0 }))).toBe(true)
		expect(needsSetup(facts({ isSenderSet: false, hasTestSend: false }))).toBe(
			false,
		)
	})
})

describe('isSetupComplete', () => {
	it('is complete only once every step is done', () => {
		expect(isSetupComplete(facts())).toBe(true)
		expect(isSetupComplete(facts({ hasTestSend: false }))).toBe(false)
		expect(isSetupComplete(facts({ isSenderSet: false }))).toBe(false)
	})
})
