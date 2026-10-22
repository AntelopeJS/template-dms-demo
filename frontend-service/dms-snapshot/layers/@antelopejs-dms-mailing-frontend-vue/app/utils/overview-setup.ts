import { SETTINGS_PATH, TEMPLATES_PATH } from './pages'

export type SetupStepId = 'provider' | 'sender' | 'publish' | 'test'

export type SetupStepState = 'done' | 'current' | 'todo'

/** What `GET /metrics/setup` answers. */
export interface SetupFacts {
	isProviderConnected: boolean
	isSenderSet: boolean
	liveTemplateCount: number
	hasTestSend: boolean
}

export interface SetupStepDefinition {
	id: SetupStepId
	/**
	 * Where the step is done; absent when it is not done in the app (the
	 * provider is set in the project's configuration).
	 */
	to?: string
	isDone: (facts: SetupFacts) => boolean
}

export interface SetupStep {
	id: SetupStepId
	number: number
	to?: string
	state: SetupStepState
}

/** A settings form section, by the id the DMS form gives its anchor. */
const SETTINGS_SECTION = `${SETTINGS_PATH}#dms-form-content-section-`

export const SETUP_STEPS: SetupStepDefinition[] = [
	{
		id: 'provider',
		isDone: (facts) => facts.isProviderConnected,
	},
	{
		id: 'sender',
		to: `${SETTINGS_SECTION}sender`,
		isDone: (facts) => facts.isSenderSet,
	},
	{
		id: 'publish',
		to: TEMPLATES_PATH,
		isDone: (facts) => facts.liveTemplateCount > 0,
	},
	{
		id: 'test',
		to: TEMPLATES_PATH,
		isDone: (facts) => facts.hasTestSend,
	},
]

/**
 * The first-run checklist: each step done or not from what the workspace
 * holds, the first one left marked current.
 */
export function setupSteps(facts: SetupFacts): SetupStep[] {
	const done = SETUP_STEPS.map((step) => step.isDone(facts))
	const current = done.indexOf(false)
	return SETUP_STEPS.map((step, index) => ({
		id: step.id,
		number: index + 1,
		to: step.to,
		state: done[index] ? 'done' : index === current ? 'current' : 'todo',
	}))
}

/**
 * The dashboard only makes sense once e-mail can leave and a template is live:
 * a draft alone sends nothing.
 */
export function needsSetup(facts: SetupFacts): boolean {
	return !facts.isProviderConnected || facts.liveTemplateCount === 0
}

/** Every step of the checklist is done: nothing left to resume. */
export function isSetupComplete(facts: SetupFacts): boolean {
	return SETUP_STEPS.every((step) => step.isDone(facts))
}
