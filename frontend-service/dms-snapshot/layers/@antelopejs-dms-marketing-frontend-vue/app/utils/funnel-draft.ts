import { sampleSizePerArm } from './sample-size'

/**
 * The rules of a funnel draft, as the builder checks them before a save.
 *
 * They mirror the backend's (src/types/constants.ts, src/utils/funnel-steps-type.ts
 * and src/utils/experiment-type.ts): what passes here passes there, so a
 * refusal shows under its field before the request instead of after it.
 */
export const MAX_NAME_LENGTH = 100
export const MAX_STEPS = 10
export const MAX_STEP_VALUE_LENGTH = 500
export const MAX_WINDOW_HOURS = 720
export const MIN_VARIATIONS = 2
export const MAX_VARIATIONS = 8
export const MAX_EXPERIMENT_KEY_LENGTH = 64

/** The slug page code passes to `dmsMarketing.variation(…)`, both for the
 * experiment and its arms: it starts with a letter or a digit. */
const EXPERIMENT_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

export function isExperimentKey(key: string): boolean {
  return (
    key.length <= MAX_EXPERIMENT_KEY_LENGTH && EXPERIMENT_KEY_PATTERN.test(key)
  )
}

export interface StepValue {
  kind: 'url' | 'custom'
  value: string
}

export interface VariationValue {
  key: string
  /** A number, or '' while its input is empty. */
  weight: number | string
}

export interface FunnelDraftValues {
  name: string
  websiteId: string
  steps: StepValue[]
  windowHours: number | string
  split: boolean
  experimentKey: string
  variations: VariationValue[]
}

/** The request body keys, which also name the fields the server's errors
 * land on. `variations` has no key of its own: it is the experiment's arms. */
export type DraftField =
  | 'name'
  | 'websiteId'
  | 'steps'
  | 'conversionWindowHours'
  | 'experiment'
  | 'variations'

export interface DraftIssue {
  /** i18n key of the message, under page.marketing.builder.errors. */
  message: string
  params?: Record<string, unknown>
  /** The step or variation row the issue names. */
  index?: number
}

function isStep(step: unknown): step is StepValue {
  const candidate = step as Partial<StepValue> | null
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    (candidate.kind === 'url' || candidate.kind === 'custom') &&
    typeof candidate.value === 'string'
  )
}

/**
 * The steps of a `?steps=` template link a funnel can hold. A link is typed
 * or edited by hand: anything malformed is dropped, never thrown.
 */
export function templateSteps(raw: unknown): StepValue[] {
  if (typeof raw !== 'string') {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed
    .filter(isStep)
    .map((step) => ({ kind: step.kind, value: step.value.trim() }))
    .filter(
      (step) => step.value !== '' && step.value.length <= MAX_STEP_VALUE_LENGTH,
    )
    .slice(0, MAX_STEPS)
}

/** Whether a window is an hour count the server stores as is. */
export function isWindowHours(hours: number | string): hours is number {
  return (
    typeof hours === 'number' &&
    Number.isInteger(hours) &&
    hours >= 1 &&
    hours <= MAX_WINDOW_HOURS
  )
}

function isWeight(weight: number | string): weight is number {
  return typeof weight === 'number' && Number.isFinite(weight) && weight >= 0
}

function stepIssue(steps: StepValue[]): DraftIssue | undefined {
  const index = steps.findIndex(
    (step) => step.value.trim().length > MAX_STEP_VALUE_LENGTH,
  )
  if (index >= 0) {
    return {
      message: 'step_length',
      params: { index: index + 1, max: MAX_STEP_VALUE_LENGTH },
      index,
    }
  }
  if (!steps.some((step) => step.value.trim() !== '')) {
    return { message: 'steps', index: 0 }
  }
  return undefined
}

function variationIssue(variations: VariationValue[]): DraftIssue | undefined {
  const keys = variations.map((arm) => arm.key.trim())
  const badKey = keys.findIndex(
    (key, index) => !isExperimentKey(key) || keys.indexOf(key) !== index,
  )
  if (badKey >= 0) {
    return {
      message: 'variations',
      params: { max: MAX_EXPERIMENT_KEY_LENGTH },
      index: badKey,
    }
  }
  const badWeight = variations.findIndex((arm) => !isWeight(arm.weight))
  const total = variations.reduce(
    (sum, arm) => sum + (isWeight(arm.weight) ? arm.weight : 0),
    0,
  )
  if (badWeight >= 0 || total <= 0) {
    return { message: 'weights', index: Math.max(badWeight, 0) }
  }
  return undefined
}

/**
 * The first issue of each field, in the order the form shows them. A split
 * that has started keeps its stored key and arms, so they are not checked.
 */
export function draftIssues(
  draft: FunnelDraftValues,
  frozen: boolean,
): Partial<Record<DraftField, DraftIssue>> {
  const issues: Partial<Record<DraftField, DraftIssue>> = {}
  const name = draft.name.trim()
  if (!name) {
    issues.name = { message: 'name' }
  } else if (name.length > MAX_NAME_LENGTH) {
    issues.name = { message: 'name_length', params: { max: MAX_NAME_LENGTH } }
  }
  if (!draft.websiteId) {
    issues.websiteId = { message: 'website' }
  }
  const steps = stepIssue(draft.steps)
  if (steps) {
    issues.steps = steps
  }
  if (!isWindowHours(draft.windowHours)) {
    issues.conversionWindowHours = {
      message: 'window',
      params: { max: MAX_WINDOW_HOURS },
    }
  }
  if (draft.split && !frozen) {
    if (!isExperimentKey(draft.experimentKey.trim())) {
      issues.experiment = {
        message: 'key',
        params: { max: MAX_EXPERIMENT_KEY_LENGTH },
      }
    }
    const variations = variationIssue(draft.variations)
    if (variations) {
      issues.variations = variations
    }
  }
  return issues
}

/**
 * Entered sessions a split needs before a relative `lift` on `rate` can be
 * told from noise: each arm needs `sampleSizePerArm`, and the arm with the
 * smallest share of the traffic is the one that takes longest to get it.
 * Null without two arms that receive traffic.
 */
export function splitSampleSize(
  rate: number,
  lift: number,
  weights: (number | string)[],
): number | null {
  const served = weights.filter(
    (weight): weight is number => isWeight(weight) && weight > 0,
  )
  if (rate <= 0 || served.length < MIN_VARIATIONS) {
    return null
  }
  const total = served.reduce((sum, weight) => sum + weight, 0)
  const smallestShare = Math.min(...served) / total
  return sampleSizePerArm(rate, lift) / smallestShare
}

/** The comments of the snippet, in the reader's language. */
export interface VariationSnippetComments {
  show: (variation: string) => string
  keep: (control: string) => string
}

const ENGLISH_COMMENTS: VariationSnippetComments = {
  show: (variation) => `show ${variation}`,
  keep: (control) => `null or "${control}": keep the current page`,
}

/** The snippet comments read from the locale files. */
export function localizedSnippetComments(
  t: (key: string, named: Record<string, unknown>) => string,
): VariationSnippetComments {
  return {
    show: (variation) =>
      t('page.marketing.experiment.code_show', { variation }),
    keep: (control) => t('page.marketing.experiment.code_keep', { control }),
  }
}

/**
 * The lines page code needs to serve an arm. Promise-based rather than a
 * top-level `await`, which a classic `<script>` refuses.
 */
export function variationSnippet(
  key: string,
  control: string,
  challengers: string[],
  comments: VariationSnippetComments = ENGLISH_COMMENTS,
): string {
  return [
    `window.dmsMarketing?.variation("${key}").then((arm) => {`,
    ...challengers.flatMap((challenger, index) => [
      `  ${index === 0 ? 'if' : '} else if'} (arm === "${challenger}") {`,
      `    // ${comments.show(challenger)}`,
    ]),
    '  }',
    `  // ${comments.keep(control)}`,
    '});',
  ].join('\n')
}
