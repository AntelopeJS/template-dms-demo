<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDmsRoute, useDmsRouter, useI18n } from '#dms/frontend-module'
import { parseExperimentValue } from '../composables/useExperiment'
import { parseFunnelStepsValue } from '../composables/useFunnelSteps'
import { useLatestRequest } from '../composables/useLatestRequest'
import {
  useMarketingApi,
  type MarketingExperiment,
  type MarketingFunnelPreview,
  type MarketingFunnelStep,
  type MarketingFunnelSuggestions,
} from '../composables/useMarketingApi'
import {
  useContextOnDemand,
  useFunnelRead,
  useFunnelSuggestions,
} from '../composables/useMarketingReads'
import type { ContextWebsite } from '../composables/useMarketingContext'
import {
  funnelBuilderLink,
  funnelLink,
  funnelsLink,
} from '../composables/useMarketingRoutes'
import { useContextLink } from '../composables/useContextLink'
import {
  draftIssues,
  isWindowHours,
  MAX_EXPERIMENT_KEY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_STEP_VALUE_LENGTH,
  MAX_STEPS,
  MAX_VARIATIONS,
  MAX_WINDOW_HOURS,
  MIN_VARIATIONS,
  splitSampleSize,
  templateSteps,
  localizedSnippetComments,
  variationSnippet,
  type DraftField,
  type FunnelDraftValues,
  type StepValue,
} from '../utils/funnel-draft'
import { formatNumber } from '../utils/format'
import { normalizeFunnelStepPath } from '../utils/step-path'
import { fractionDigits } from '../constants'

/**
 * The funnel builder (`?id=` to edit, `?from=` to start from a copy of a
 * funnel, `?split=1` to open the A/B section, `?steps=` to start from a
 * template). Steps are picked from the pages and events the site already
 * tracks, with their counts; the preview scores the draft over the last 30
 * days while it is edited. Follows the DMS form contract — unsaved changes
 * against a baseline, a guard before leaving, errors under their field — and
 * writes through the funnels data API, which owns the experiment lifecycle.
 */
const props = withDefaults(
  defineProps<{ componentId?: string; pageId?: string }>(),
  {
    componentId: undefined,
    pageId: undefined,
  },
)

interface StepDraft extends StepValue {
  uid: number
}

interface VariationDraft {
  uid: number
  key: string
  weight: number | string
}

// A funnel is matched within one session, which ends after 30 minutes
// without activity: a window of days would change nothing (FB-11).
const WINDOW_PRESETS = [1, 24]
const PREVIEW_DEBOUNCE_MS = 450
const SUGGESTIONS_SHOWN = 6
const MINIMUM_DETECTABLE_LIFT = 0.2
const LETTER_A = 65
const PERCENT = 100
const MS_PER_HOUR = 3_600_000
const HTTP_NOT_FOUND = 404
/** Below this, months read "under 0.1". */
const MIN_MONTHS_SHOWN = 0.1

void props

const { t, locale } = useI18n()
const route = useDmsRoute()
const router = useDmsRouter()
const api = useMarketingApi()
const toast = useToast()
const { confirm } = useConfirm()

function queryParam(key: string): string {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

const funnelId = queryParam('id')
const sourceId = funnelId ? '' : queryParam('copy')
const isEdit = funnelId !== ''

let nextUid = 1
const uid = () => nextUid++

const name = ref('')
const websiteId = ref<string>('')
const steps = ref<StepDraft[]>([{ uid: uid(), kind: 'url', value: '' }])
const windowHours = ref<number | string>(24)
const splitEnabled = ref(route.query.split === '1')
const experimentKey = ref('')
const variations = ref<VariationDraft[]>([
  { uid: uid(), key: 'control', weight: 1 },
  { uid: uid(), key: '', weight: 1 },
])
const original = ref<MarketingExperiment | null>(null)
/** The goal a started test was saved with, to warn before it changes. */
const savedObjective = ref('')
const loading = ref(true)
const loadFailed = ref<'not_found' | 'error' | null>(null)
const saving = ref(false)

/** A started split keeps its key and arms: changing them would reassign visitors. */
const frozen = computed(
  () => original.value !== null && original.value.status !== 'draft',
)

// --- Form values, baseline and leave guard -------------------------------------

function values(): FunnelDraftValues {
  return {
    name: name.value,
    websiteId: websiteId.value,
    steps: steps.value.map(({ kind, value }) => ({ kind, value })),
    windowHours: windowHours.value,
    split: splitEnabled.value,
    experimentKey: experimentKey.value,
    variations: variations.value.map(({ key, weight }) => ({ key, weight })),
  }
}

function applyValues(next: FunnelDraftValues): void {
  name.value = next.name
  websiteId.value = next.websiteId
  steps.value = next.steps.map((step) => ({ uid: uid(), ...step }))
  windowHours.value = next.windowHours
  splitEnabled.value = next.split
  experimentKey.value = next.experimentKey
  variations.value = next.variations.map((arm) => ({ uid: uid(), ...arm }))
}

const { dirty, baseline, markClean } = useFormDirty(values)
const { confirmLeave } = useUnsavedChanges({ dirty })

// Errors land under their field: the client's checks on a save attempt, and
// the server's — its codes name the field they belong to.
const STEP_CONTROL_PREFIX = 'funnel-step-'
const VARIATION_CONTROL_PREFIX = 'funnel-variation-'
const flaggedStep = ref<number | null>(null)
const flaggedVariation = ref<number | null>(null)

/** The flagged row's input, else the first row's (a server error names no row). */
function rowControl(prefix: string, flagged: number | null, first?: number) {
  return document.getElementById(`${prefix}${flagged ?? first}`)
}

const fieldErrors = useFieldErrors<DraftField>({
  fields: {
    name: 'funnel-name',
    websiteId: 'funnel-website',
    steps: () =>
      rowControl(STEP_CONTROL_PREFIX, flaggedStep.value, steps.value[0]?.uid),
    conversionWindowHours: 'funnel-window',
    experiment: 'funnel-experiment-key',
    variations: () =>
      rowControl(
        VARIATION_CONTROL_PREFIX,
        flaggedVariation.value,
        variations.value[0]?.uid,
      ),
  },
  codes: {
    '$page.marketing.errors.invalid_steps': 'steps',
    '$page.marketing.errors.invalid_experiment_key': 'experiment',
    '$page.marketing.errors.duplicate_experiment_key': 'experiment',
    '$page.marketing.errors.experiment_locked': 'experiment',
    '$page.marketing.errors.invalid_variations': 'variations',
    '$page.marketing.errors.website_not_found': 'websiteId',
  },
})

function clearStepError(): void {
  flaggedStep.value = null
  fieldErrors.clear('steps')
}

function clearVariationError(): void {
  flaggedVariation.value = null
  fieldErrors.clear('variations')
}

// --- Loading -------------------------------------------------------------------

// The definition edited, or the one a Duplicate copies.
const readDefinition = useFunnelRead(funnelId || sourceId)
const readContext = useContextOnDemand()

/** A stored definition as the form holds it. */
async function fetchDefinition() {
  const row = await readDefinition()
  const experiment = parseExperimentValue(row.experiment)
  const draft: FunnelDraftValues = {
    name: row.name,
    websiteId:
      typeof row.websiteId === 'string' ? row.websiteId : row.websiteId._id,
    steps: parseFunnelStepsValue(row.steps),
    windowHours: row.conversionWindowHours,
    split: experiment !== null,
    experimentKey: experiment?.key ?? '',
    variations: experiment?.variations ?? values().variations,
  }
  const stored: MarketingExperiment | null = experiment && {
    key: experiment.key,
    status: experiment.status ?? 'draft',
    variations: experiment.variations,
    runs: experiment.runs,
  }
  return { draft, experiment: stored }
}

function objectiveOf(draft: FunnelDraftValues): string {
  const kept = draft.steps
    .map((step) => ({ kind: step.kind, value: step.value.trim() }))
    .filter((step) => step.value !== '')
  return JSON.stringify([kept, draft.windowHours])
}

async function loadExisting(): Promise<void> {
  const { draft, experiment } = await fetchDefinition()
  applyValues(draft)
  original.value = experiment
  savedObjective.value = objectiveOf(draft)
}

/** The copy a Duplicate opened on, what Discard returns to. */
const copied = ref<FunnelDraftValues | null>(null)

/** Duplicate: the copy is a new draft, unsaved until the user saves it — its
 * experiment key must change, keys being unique per site. */
async function loadCopy(): Promise<void> {
  const { draft } = await fetchDefinition()
  applyValues({
    ...draft,
    name: t('page.marketing.builder.copy_name', { name: draft.name }).slice(
      0,
      MAX_NAME_LENGTH,
    ),
    experimentKey: '',
  })
  copied.value = values()
}

// The builder sits outside the context bar: it reads the website list itself,
// and starts a new funnel on the website of the page it was opened from, else
// on the member's selection.
const websites = ref<ContextWebsite[]>([])

async function loadWebsites(): Promise<void> {
  const payload = await readContext()
  websites.value = payload.websites
  const linked = queryParam('website')
  websiteId.value ||=
    (payload.websites.some((site) => site.id === linked) ? linked : null) ??
    payload.selectedId ??
    ''
}

async function load(): Promise<void> {
  loading.value = true
  loadFailed.value = null
  try {
    // The funnel first: its site then wins over the context's, and the
    // suggestions are read once, for the right site.
    if (isEdit) {
      await loadExisting()
    }
    await loadWebsites().catch(() => undefined)
    const template = templateSteps(route.query.steps)
    if (!isEdit && template.length > 0) {
      steps.value = template.map((step) => ({ uid: uid(), ...step }))
    }
    // The starting point: what the page opened on. A copy is applied after
    // it, so it counts as a change to save.
    markClean()
    if (sourceId) {
      await loadCopy()
    }
  } catch (error) {
    loadFailed.value =
      apiErrorStatus(error) === HTTP_NOT_FOUND ? 'not_found' : 'error'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// --- Suggestions and preview -------------------------------------------------

const NO_SUGGESTIONS: MarketingFunnelSuggestions = { pages: [], events: [] }

// Read once the site is known (the context, or the funnel being edited).
const suggestionsRead = useFunnelSuggestions(websiteId)
const suggestions = computed(() =>
  suggestionsRead.error.value
    ? NO_SUGGESTIONS
    : (suggestionsRead.data.value ?? NO_SUGGESTIONS),
)

const focusedStep = ref<number | null>(null)
/** The step whose list Escape closed, until it is typed in again. */
const dismissedStep = ref<number | null>(null)
const activeOption = ref(-1)

function matchesFor(step: StepDraft) {
  const pool =
    step.kind === 'url' ? suggestions.value.pages : suggestions.value.events
  const needle = step.value.trim().toLowerCase()
  return pool
    .filter((entry) => !needle || entry.value.toLowerCase().includes(needle))
    .filter((entry) => entry.value !== step.value)
    .slice(0, SUGGESTIONS_SHOWN)
}

function listOpen(step: StepDraft): boolean {
  return (
    focusedStep.value === step.uid &&
    dismissedStep.value !== step.uid &&
    matchesFor(step).length > 0
  )
}

function focusStep(step: StepDraft): void {
  focusedStep.value = step.uid
  activeOption.value = -1
}

const BLUR_DELAY_MS = 150

/** Late enough for a click on a suggestion to land first. */
function blurStep(step: StepDraft): void {
  setTimeout(() => {
    if (focusedStep.value === step.uid) {
      focusedStep.value = null
    }
  }, BLUR_DELAY_MS)
}

function typeStep(): void {
  dismissedStep.value = null
  activeOption.value = -1
  clearStepError()
}

function pick(step: StepDraft, value: string): void {
  step.value = value
  dismissedStep.value = step.uid
  activeOption.value = -1
  clearStepError()
}

/** The combobox keys: arrows move through the list, Enter picks, Escape closes. */
function onStepKeydown(event: KeyboardEvent, step: StepDraft): void {
  if (!listOpen(step)) {
    return
  }
  const count = matchesFor(step).length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const offset = event.key === 'ArrowDown' ? 1 : -1
    activeOption.value = (activeOption.value + offset + count) % count
  } else if (event.key === 'Enter' && activeOption.value >= 0) {
    event.preventDefault()
    pick(step, matchesFor(step)[activeOption.value]!.value)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    dismissedStep.value = step.uid
  }
}

function optionId(step: StepDraft, index: number): string {
  return `${STEP_CONTROL_PREFIX}${step.uid}-option-${index}`
}

const validSteps = computed(() =>
  steps.value
    .map((step) => ({ kind: step.kind, value: step.value.trim() }))
    .filter((step) => step.value !== ''),
)

/** Where each filled step sits in the preview, which skips the empty ones —
 * by position, so a step repeated later reads its own count. */
const previewIndex = computed(() => {
  const index = new Map<number, number>()
  for (const step of steps.value) {
    if (step.value.trim() !== '') {
      index.set(step.uid, index.size)
    }
  }
  return index
})

/** The preview scores what the server would accept, nothing else. */
const previewable = computed(
  () =>
    isWindowHours(windowHours.value) &&
    validSteps.value.every(
      (step) => step.value.length <= MAX_STEP_VALUE_LENGTH,
    ),
)

const {
  data: preview,
  loading: previewing,
  failed: previewFailed,
  run: runPreview,
} = useLatestRequest<MarketingFunnelPreview>(() =>
  websiteId.value && validSteps.value.length > 0 && previewable.value
    ? api.previewFunnel(
        websiteId.value,
        validSteps.value,
        windowHours.value as number,
      )
    : null,
)

let previewTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [validSteps, windowHours, websiteId],
  () => {
    if (previewTimer) {
      clearTimeout(previewTimer)
    }
    previewTimer = setTimeout(() => void runPreview(), PREVIEW_DEBOUNCE_MS)
  },
  { deep: true, immediate: true },
)

onBeforeUnmount(() => previewTimer && clearTimeout(previewTimer))

function previewCount(step: StepDraft): number | null {
  const index = previewIndex.value.get(step.uid)
  return index === undefined
    ? null
    : (preview.value?.computation.steps[index]?.sessions ?? null)
}

const previewRows = computed(() => preview.value?.computation.steps ?? [])

/** Under a step: the path a pasted URL is matched as, or a step the site
 * never sent over the preview's 30 days (unless the read hit its cap). */
function stepHint(step: StepDraft): { text: string; warning: boolean } | null {
  const value = step.value.trim()
  if (!value) {
    return null
  }
  const index = previewIndex.value.get(step.uid)
  const row = index === undefined ? undefined : previewRows.value[index]
  if (
    row &&
    row.matches === 0 &&
    (preview.value?.computation.events ?? 0) > 0 &&
    !preview.value?.truncated
  ) {
    return { text: t('page.marketing.builder.step_unseen'), warning: true }
  }
  if (step.kind === 'url') {
    const path = normalizeFunnelStepPath(value)
    if (path !== value) {
      return {
        text: t('page.marketing.builder.step_matched_as', { path }),
        warning: false,
      }
    }
  }
  return null
}

const entered = computed(() => previewRows.value[0]?.sessions ?? 0)
const converted = computed(() => previewRows.value.at(-1)?.sessions ?? 0)
const endToEnd = computed(() =>
  entered.value > 0 ? (converted.value / entered.value) * PERCENT : null,
)

/** Share of the previous step's sessions that reached this one. */
function stepRate(index: number): string | null {
  const before = previewRows.value[index - 1]?.sessions ?? 0
  if (index === 0 || before <= 0) {
    return null
  }
  return String(
    formatPercentage(
      previewRows.value[index]!.sessions / before,
      locale.value,
      fractionDigits(0),
    ),
  )
}

/** How long the split would need, at the traffic the preview measured (the
 * preview covers 30 days, so its entered sessions are a month's). Moot once
 * the test has started: the arms can no longer change. */
const sampleHint = computed(() => {
  const rate = entered.value > 0 ? converted.value / entered.value : 0
  const total = splitSampleSize(
    rate,
    MINIMUM_DETECTABLE_LIFT,
    variations.value.map((arm) => arm.weight),
  )
  if (frozen.value || total === null) {
    return null
  }
  const months = total / entered.value
  const duration =
    months < MIN_MONTHS_SHOWN
      ? t('page.marketing.builder.months_under', {
          months: formatNumber(MIN_MONTHS_SHOWN, locale.value, 1),
        })
      : t(
          'page.marketing.builder.months',
          {
            months: formatNumber(months, locale.value, months < 1 ? 1 : 0),
          },
          months <= 1 ? 1 : 2,
        )
  return {
    total: formatNumber(Math.round(total), locale.value),
    rate: formatPercentage(rate, locale.value, fractionDigits(1)),
    duration,
    tooSmall: months > 3,
  }
})

// --- Editing -------------------------------------------------------------------

function addStep(kind: MarketingFunnelStep['kind'] = 'url', value = ''): void {
  clearStepError()
  const empty = steps.value.find((step) => step.value.trim() === '')
  if (value && empty) {
    empty.kind = kind
    empty.value = value
    return
  }
  if (steps.value.length < MAX_STEPS) {
    steps.value.push({ uid: uid(), kind, value })
  }
}

function removeStep(index: number): void {
  clearStepError()
  steps.value.splice(index, 1)
}

function moveStep(index: number, offset: number): void {
  const target = index + offset
  if (target < 0 || target >= steps.value.length) {
    return
  }
  const [step] = steps.value.splice(index, 1)
  steps.value.splice(target, 0, step!)
}

const windowItems = computed(() =>
  WINDOW_PRESETS.map((hours) => ({
    value: hours,
    label: t(`page.marketing.builder.window_presets.${hours}`),
  })),
)

const kindItems = computed(() => [
  {
    value: 'url',
    label: t('page.marketing.funnel.kind.url'),
    icon: 'i-ph-browser',
  },
  {
    value: 'custom',
    label: t('page.marketing.funnel.kind.custom'),
    icon: 'i-ph-lightning',
  },
])

function servedWeight(arm: VariationDraft): number {
  return typeof arm.weight === 'number' && arm.weight > 0 ? arm.weight : 0
}

const totalWeight = computed(() =>
  variations.value.reduce((sum, arm) => sum + servedWeight(arm), 0),
)

function share(arm: VariationDraft): number {
  return totalWeight.value > 0
    ? (servedWeight(arm) / totalWeight.value) * PERCENT
    : 0
}

function addVariation(): void {
  clearVariationError()
  if (variations.value.length < MAX_VARIATIONS) {
    variations.value.push({ uid: uid(), key: '', weight: 1 })
  }
}

function removeVariation(index: number): void {
  clearVariationError()
  variations.value.splice(index, 1)
}

function letter(index: number): string {
  return String.fromCharCode(LETTER_A + index)
}

const firstUrlStep = computed(
  () => validSteps.value.find((step) => step.kind === 'url')?.value ?? '/',
)

const snippetComments = computed(() => localizedSnippetComments(t))

const snippet = computed(() =>
  variationSnippet(
    experimentKey.value.trim() || 'experiment-key',
    variations.value[0]?.key.trim() || 'control',
    [variations.value[1]?.key.trim() || 'variation'],
    snippetComments.value,
  ),
)

/** The steps or the window of a started test differ from the saved ones:
 * saving re-scores the whole test against the new goal. */
const objectiveChanged = computed(
  () => frozen.value && objectiveOf(values()) !== savedObjective.value,
)

// --- Validation and save -------------------------------------------------------

async function showDraftIssues(): Promise<boolean> {
  const issues = draftIssues(values(), frozen.value)
  const fields = Object.keys(issues) as DraftField[]
  if (fields.length === 0) {
    return false
  }
  fieldErrors.clear()
  flaggedStep.value =
    issues.steps?.index === undefined
      ? null
      : (steps.value[issues.steps.index]?.uid ?? null)
  flaggedVariation.value =
    issues.variations?.index === undefined
      ? null
      : (variations.value[issues.variations.index]?.uid ?? null)
  for (const field of fields) {
    const issue = issues[field]!
    fieldErrors.errors[field] = t(
      `page.marketing.builder.errors.${issue.message}`,
      issue.params ?? {},
    )
  }
  await fieldErrors.focus(fields[0]!)
  return true
}

function experimentPayload(): MarketingExperiment | null {
  if (!splitEnabled.value) {
    return null
  }
  if (frozen.value && original.value) {
    return original.value
  }
  return {
    key: experimentKey.value.trim(),
    status: original.value?.status ?? 'draft',
    variations: variations.value.map((arm) => ({
      key: arm.key.trim(),
      weight: arm.weight as number,
    })),
    runs: original.value?.runs ?? [],
  }
}

function confirmObjectiveChange(): Promise<boolean> {
  return confirm({
    title: t('page.marketing.builder.objective_confirm.title'),
    description: t('page.marketing.builder.objective_confirm.description'),
    confirmLabel: t('page.marketing.builder.objective_confirm.confirm'),
    cancelLabel: t('page.marketing.builder.objective_confirm.cancel'),
    color: 'warning',
    icon: 'i-ph-warning',
  })
}

async function save(): Promise<void> {
  // Several clicks in one tick would each create a funnel.
  if (saving.value) {
    return
  }
  saving.value = true
  try {
    if (await showDraftIssues()) {
      return
    }
    if (objectiveChanged.value && !(await confirmObjectiveChange())) {
      return
    }
    const input = {
      websiteId: websiteId.value,
      name: name.value.trim(),
      steps: validSteps.value,
      conversionWindowHours: windowHours.value as number,
      experiment: experimentPayload(),
    }
    const id = isEdit ? funnelId : (await api.createFunnel(input))[0]
    if (isEdit) {
      await api.updateFunnel(funnelId, input)
    }
    // Clean before leaving, or the leave guard would ask.
    markClean()
    toast.add({
      color: 'success',
      title: t('page.marketing.builder.saved'),
    })
    await router.push(inContext(id ? funnelLink(id) : funnelsLink()))
  } catch (error) {
    await fieldErrors.handleApiError(error, {
      toastTitle: 'page.marketing.builder.save_error',
    })
  } finally {
    saving.value = false
  }
}

/** Back to what the page opened on: the copy itself for a Duplicate, which
 * stays a change to save. */
function discard(): void {
  clearStepError()
  clearVariationError()
  fieldErrors.clear()
  applyValues(copied.value ?? baseline.value)
}

/** A link out of the builder, on the website and period it was opened from. */
const inContext = useContextLink()

const backLink = computed(() => {
  if (isEdit) {
    return inContext(funnelLink(funnelId))
  }
  return inContext(sourceId ? funnelLink(sourceId) : funnelsLink())
})

/** `remount` for another builder URL: the same page otherwise stays
 * mounted on the funnel it opened with. */
async function leave(href: string, remount = false): Promise<void> {
  if (await confirmLeave()) {
    await router.push(href, remount ? { preserveState: false } : undefined)
  }
}

const websiteItems = computed(() =>
  websites.value.map((site) => ({
    value: site.id,
    label: `${site.name} · ${site.domain}`,
  })),
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-start gap-4">
      <UButton
        icon="i-ph-arrow-left"
        color="neutral"
        variant="ghost"
        :aria-label="t('page.marketing.funnel.back')"
        @click="leave(backLink)"
      />
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold break-words text-highlighted">
          {{
            loadFailed
              ? t('page.marketing.builder.page_title')
              : isEdit
                ? t('page.marketing.builder.edit_title', { name: name || '…' })
                : t('page.marketing.builder.title')
          }}
        </h1>
        <p v-if="!loadFailed" class="mt-1 max-w-3xl text-sm text-muted">
          {{ t('page.marketing.builder.subtitle') }}
        </p>
      </div>
      <UButton
        v-if="isEdit && !loading && !loadFailed"
        icon="i-ph-copy"
        color="neutral"
        variant="outline"
        :label="t('page.marketing.builder.duplicate')"
        @click="
          leave(inContext(funnelBuilderLink(null, { copy: funnelId })), true)
        "
      />
    </header>

    <div v-if="loading" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <USkeleton class="h-[36rem] rounded-xl" />
      <USkeleton class="h-72 rounded-xl" />
    </div>

    <DmsEmptyState
      v-else-if="loadFailed"
      variant="error"
      class="dms-card"
      :title="
        t(
          loadFailed === 'not_found'
            ? 'page.marketing.errors.funnel_not_found'
            : 'page.marketing.builder.load_error',
        )
      "
    >
      <template #actions>
        <UButton
          v-if="loadFailed === 'error'"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-arrow-clockwise"
          :label="t('page.marketing.common.retry')"
          @click="load"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-arrow-left"
          :label="t('page.marketing.funnel.back')"
          @click="router.push(inContext(funnelsLink()))"
        />
      </template>
    </DmsEmptyState>

    <div
      v-else
      class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <div class="dms-card flex min-w-0 flex-col divide-y divide-default p-0">
        <section class="flex flex-col gap-4 p-5">
          <h2
            class="flex items-center gap-2 text-sm font-semibold text-highlighted"
          >
            <span class="font-mono text-xs text-primary">01</span>
            {{ t('page.marketing.builder.sections.basics') }}
          </h2>
          <div class="grid gap-4 md:grid-cols-2">
            <DmsFieldRow
              layout="stack"
              spacing="list"
              :inset="false"
              label="$page.marketing.builder.name"
              label-for="funnel-name"
              required
            >
              <UInput
                id="funnel-name"
                v-model="name"
                class="w-full"
                :maxlength="MAX_NAME_LENGTH"
                aria-required="true"
                :placeholder="t('page.marketing.builder.name_placeholder')"
                v-bind="fieldErrors.aria('name')"
                @update:model-value="fieldErrors.clear('name')"
              />
              <DmsFieldError
                :id="fieldErrors.errorId('name')"
                :message="fieldErrors.errors.name"
              />
            </DmsFieldRow>
            <DmsFieldRow
              layout="stack"
              spacing="list"
              :inset="false"
              label="$page.marketing.builder.website"
              :description="
                isEdit && frozen
                  ? '$page.marketing.builder.website_locked'
                  : undefined
              "
              label-for="funnel-website"
              required
            >
              <USelect
                id="funnel-website"
                v-model="websiteId"
                class="w-full"
                :items="websiteItems"
                :disabled="isEdit && frozen"
                required
                v-bind="fieldErrors.aria('websiteId')"
                @update:model-value="fieldErrors.clear('websiteId')"
              />
              <DmsFieldError
                :id="fieldErrors.errorId('websiteId')"
                :message="fieldErrors.errors.websiteId"
              />
            </DmsFieldRow>
          </div>
        </section>

        <section class="flex flex-col gap-3 p-5">
          <div
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
          >
            <h2
              class="flex items-center gap-2 text-sm font-semibold text-highlighted"
            >
              <span class="font-mono text-xs text-primary">02</span>
              <span>
                {{ t('page.marketing.builder.sections.steps') }}
                <span class="text-error" aria-hidden="true">*</span>
              </span>
            </h2>
            <span class="text-xs text-dimmed">
              {{ t('page.marketing.builder.steps_hint', { max: MAX_STEPS }) }}
            </span>
          </div>
          <DmsBanner
            v-if="objectiveChanged"
            tone="warning"
            size="sm"
            icon="i-ph-warning"
            :title="t('page.marketing.builder.objective_title')"
            :description="t('page.marketing.builder.objective_description')"
          />
          <ol class="flex flex-col gap-2">
            <li
              v-for="(step, index) in steps"
              :key="step.uid"
              class="relative grid grid-cols-[auto_1.75rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border p-2 md:grid-cols-[auto_1.75rem_9rem_minmax(0,1fr)_auto_auto]"
              :class="
                flaggedStep === step.uid
                  ? 'border-error'
                  : focusedStep === step.uid
                    ? 'border-primary'
                    : 'border-default'
              "
            >
              <span class="flex flex-col">
                <UButton
                  icon="i-ph-caret-up"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === 0"
                  :aria-label="
                    t('page.marketing.builder.move_up_step', { n: index + 1 })
                  "
                  @click="moveStep(index, -1)"
                />
                <UButton
                  icon="i-ph-caret-down"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === steps.length - 1"
                  :aria-label="
                    t('page.marketing.builder.move_down_step', { n: index + 1 })
                  "
                  @click="moveStep(index, 1)"
                />
              </span>
              <span
                class="grid size-7 place-items-center rounded-md font-mono text-xs"
                :class="
                  index === steps.length - 1 && steps.length > 1
                    ? 'bg-primary text-inverted'
                    : 'bg-elevated text-toned'
                "
              >
                <UIcon
                  v-if="index === steps.length - 1 && steps.length > 1"
                  name="i-ph-flag-checkered"
                  class="size-3.5"
                />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <USelect
                v-model="step.kind"
                :items="kindItems"
                size="sm"
                :aria-label="
                  t('page.marketing.builder.step_kind_label', { n: index + 1 })
                "
                @update:model-value="clearStepError"
              />
              <div
                class="relative order-last col-span-full md:order-none md:col-span-1"
              >
                <UInput
                  :id="`${STEP_CONTROL_PREFIX}${step.uid}`"
                  v-model="step.value"
                  size="sm"
                  class="w-full font-mono"
                  :maxlength="MAX_STEP_VALUE_LENGTH"
                  :placeholder="
                    step.kind === 'url' ? '/pricing' : 'signup_submitted'
                  "
                  role="combobox"
                  aria-autocomplete="list"
                  :aria-label="
                    t('page.marketing.builder.step_value_label', {
                      n: index + 1,
                    })
                  "
                  :aria-expanded="listOpen(step)"
                  :aria-controls="`${STEP_CONTROL_PREFIX}${step.uid}-list`"
                  :aria-activedescendant="
                    listOpen(step) && activeOption >= 0
                      ? optionId(step, activeOption)
                      : undefined
                  "
                  v-bind="
                    flaggedStep === step.uid ? fieldErrors.aria('steps') : {}
                  "
                  @focus="focusStep(step)"
                  @blur="blurStep(step)"
                  @keydown="onStepKeydown($event, step)"
                  @update:model-value="typeStep"
                />
                <div
                  v-if="listOpen(step)"
                  class="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-default bg-default shadow-lg"
                >
                  <div class="px-3 pt-2 pb-1">
                    <DmsEyebrow
                      :label="
                        t(
                          step.kind === 'url'
                            ? 'page.marketing.builder.tracked_pages'
                            : 'page.marketing.builder.tracked_events',
                        )
                      "
                    />
                  </div>
                  <ul
                    :id="`${STEP_CONTROL_PREFIX}${step.uid}-list`"
                    role="listbox"
                  >
                    <li
                      v-for="(match, matchIndex) in matchesFor(step)"
                      :id="optionId(step, matchIndex)"
                      :key="match.value"
                      role="option"
                      :aria-selected="activeOption === matchIndex"
                      class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-elevated"
                      :class="{ 'bg-elevated': activeOption === matchIndex }"
                      @mousedown.prevent="pick(step, match.value)"
                    >
                      <UIcon
                        :name="
                          step.kind === 'url'
                            ? 'i-ph-browser'
                            : 'i-ph-lightning'
                        "
                        class="size-3.5 text-dimmed"
                      />
                      <span
                        class="flex-1 truncate font-mono text-[13px] text-highlighted"
                      >
                        {{ match.value }}
                      </span>
                      <span class="font-mono text-[11px] text-dimmed">
                        {{
                          t(
                            step.kind === 'url'
                              ? 'page.marketing.builder.views'
                              : 'page.marketing.builder.triggers',
                            { count: formatNumber(match.count, locale) },
                            match.count,
                          )
                        }}
                      </span>
                    </li>
                  </ul>
                </div>
                <p
                  v-if="stepHint(step)"
                  class="mt-1 flex items-center gap-1 text-xs"
                  :class="
                    stepHint(step)!.warning ? 'text-warning' : 'text-dimmed'
                  "
                >
                  <UIcon
                    :name="
                      stepHint(step)!.warning ? 'i-ph-warning' : 'i-ph-info'
                    "
                    class="size-3.5 shrink-0"
                  />
                  {{ stepHint(step)!.text }}
                </p>
              </div>
              <span
                class="text-right font-mono text-[11px] text-muted md:min-w-20"
              >
                <template v-if="previewCount(step) !== null">
                  <span class="font-semibold text-highlighted">
                    {{ formatNumber(previewCount(step)!, locale) }}
                  </span>
                  {{ t('page.marketing.builder.sessions_short') }}
                </template>
              </span>
              <UButton
                icon="i-ph-x"
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="steps.length === 1"
                :aria-label="
                  t('page.marketing.builder.remove_step_n', { n: index + 1 })
                "
                @click="removeStep(index)"
              />
            </li>
          </ol>
          <DmsFieldError
            :id="fieldErrors.errorId('steps')"
            :message="fieldErrors.errors.steps"
          />
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              icon="i-ph-plus"
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="steps.length >= MAX_STEPS"
              :label="t('page.marketing.builder.add_step')"
              @click="addStep()"
            />
            <span class="text-xs text-dimmed">
              {{ t('page.marketing.builder.goal_hint') }}
            </span>
          </div>
        </section>

        <section class="flex flex-col gap-3 p-5">
          <div
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
          >
            <h2
              class="flex items-center gap-2 text-sm font-semibold text-highlighted"
            >
              <span class="font-mono text-xs text-primary">03</span>
              {{ t('page.marketing.builder.sections.window') }}
            </h2>
            <span class="text-xs text-dimmed">
              {{ t('page.marketing.builder.window_hint') }}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <DmsSegmented
              v-model="windowHours"
              :items="windowItems"
              variant="mono"
              size="sm"
              @update:model-value="fieldErrors.clear('conversionWindowHours')"
            />
            <span class="text-xs text-dimmed">
              {{ t('page.marketing.builder.or') }}
            </span>
            <UInput
              id="funnel-window"
              v-model.number="windowHours"
              type="number"
              :min="1"
              :max="MAX_WINDOW_HOURS"
              :step="1"
              size="sm"
              class="w-28"
              :aria-label="t('page.marketing.builder.window_label')"
              v-bind="fieldErrors.aria('conversionWindowHours')"
              @update:model-value="fieldErrors.clear('conversionWindowHours')"
            >
              <template #trailing>
                <span class="text-xs text-dimmed">
                  {{ t('page.marketing.builder.hours') }}
                </span>
              </template>
            </UInput>
            <span class="text-xs text-dimmed">
              {{
                t('page.marketing.builder.window_max', {
                  max: MAX_WINDOW_HOURS,
                })
              }}
            </span>
          </div>
          <DmsFieldError
            :id="fieldErrors.errorId('conversionWindowHours')"
            :message="fieldErrors.errors.conversionWindowHours"
          />
        </section>

        <section class="flex flex-col gap-3 p-5">
          <div
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
          >
            <h2
              class="flex items-center gap-2 text-sm font-semibold text-highlighted"
            >
              <span class="font-mono text-xs text-primary">04</span>
              {{ t('page.marketing.builder.sections.split') }}
            </h2>
            <span class="text-xs text-dimmed">
              {{ t('page.marketing.builder.optional') }}
            </span>
          </div>
          <div
            class="flex items-start gap-3 rounded-lg border border-default p-4"
          >
            <DmsIconWell icon="i-ph-flask" tone="primary" size="md" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-highlighted">
                {{ t('page.marketing.builder.split_title') }}
              </span>
              <span class="block text-xs text-muted">
                {{ t('page.marketing.builder.split_description') }}
              </span>
            </span>
            <USwitch
              v-model="splitEnabled"
              :disabled="frozen"
              :aria-label="t('page.marketing.builder.split_title')"
            />
          </div>
          <template v-if="splitEnabled">
            <DmsBanner
              v-if="frozen"
              tone="info"
              size="sm"
              icon="i-ph-lock-simple"
              :title="t('page.marketing.builder.frozen_title')"
              :description="t('page.marketing.builder.frozen_description')"
            />
            <DmsFieldRow
              layout="stack"
              spacing="list"
              :inset="false"
              label="$page.marketing.builder.key"
              description="$page.marketing.builder.key_hint"
              label-for="funnel-experiment-key"
              required
            >
              <UInput
                id="funnel-experiment-key"
                v-model="experimentKey"
                class="w-full max-w-72 font-mono"
                placeholder="sale-hero"
                :maxlength="MAX_EXPERIMENT_KEY_LENGTH"
                :disabled="frozen"
                aria-required="true"
                v-bind="fieldErrors.aria('experiment')"
                @update:model-value="fieldErrors.clear('experiment')"
              />
              <DmsFieldError
                :id="fieldErrors.errorId('experiment')"
                :message="fieldErrors.errors.experiment"
              />
            </DmsFieldRow>
            <div class="flex flex-wrap items-center justify-between gap-x-3">
              <span class="text-sm font-medium text-highlighted">
                {{ t('page.marketing.builder.variations') }}
              </span>
              <span class="text-xs text-dimmed">
                {{
                  t('page.marketing.builder.variations_hint', {
                    min: MIN_VARIATIONS,
                    max: MAX_VARIATIONS,
                  })
                }}
              </span>
            </div>
            <ul class="flex flex-col gap-2">
              <li
                v-for="(arm, index) in variations"
                :key="arm.uid"
                class="grid grid-cols-[1.5rem_minmax(0,1fr)_6rem_3rem_auto] items-center gap-2 sm:grid-cols-[1.5rem_minmax(0,1fr)_6rem_5rem_3rem_auto]"
              >
                <span
                  class="grid size-6 place-items-center rounded font-mono text-[11px] font-semibold"
                  :class="
                    index === 0
                      ? 'bg-elevated text-toned'
                      : 'bg-primary/15 text-(--ui-color-primary-800) dark:text-primary'
                  "
                >
                  {{ letter(index) }}
                </span>
                <UInput
                  :id="`${VARIATION_CONTROL_PREFIX}${arm.uid}`"
                  v-model="arm.key"
                  size="sm"
                  class="font-mono"
                  :maxlength="MAX_EXPERIMENT_KEY_LENGTH"
                  :placeholder="index === 0 ? 'control' : 'video-hero'"
                  :disabled="frozen"
                  :aria-label="
                    t('page.marketing.builder.variation_key_label', {
                      letter: letter(index),
                    })
                  "
                  v-bind="
                    flaggedVariation === arm.uid
                      ? fieldErrors.aria('variations')
                      : {}
                  "
                  @update:model-value="clearVariationError"
                />
                <UInput
                  v-model.number="arm.weight"
                  type="number"
                  :min="0"
                  size="sm"
                  :disabled="frozen"
                  :aria-label="
                    t('page.marketing.builder.variation_weight_label', {
                      letter: letter(index),
                    })
                  "
                  @update:model-value="clearVariationError"
                >
                  <template #trailing>
                    <span class="text-xs text-dimmed">
                      {{ t('page.marketing.builder.weight') }}
                    </span>
                  </template>
                </UInput>
                <span
                  class="hidden h-1.5 overflow-hidden rounded-full bg-elevated sm:block"
                >
                  <span
                    class="block h-full rounded-full"
                    :class="
                      index === 0 ? 'bg-(--ui-text-dimmed)' : 'bg-primary'
                    "
                    :style="{ width: `${share(arm)}%` }"
                  />
                </span>
                <span
                  class="text-right font-mono text-xs font-semibold text-highlighted"
                >
                  {{
                    formatPercentage(
                      share(arm) / 100,
                      locale,
                      fractionDigits(0),
                    )
                  }}
                </span>
                <UButton
                  icon="i-ph-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="frozen || variations.length <= MIN_VARIATIONS"
                  :aria-label="
                    t('page.marketing.builder.remove_variation_n', {
                      letter: letter(index),
                    })
                  "
                  @click="removeVariation(index)"
                />
              </li>
            </ul>
            <DmsFieldError
              :id="fieldErrors.errorId('variations')"
              :message="fieldErrors.errors.variations"
            />
            <UButton
              v-if="!frozen"
              icon="i-ph-plus"
              size="sm"
              color="neutral"
              variant="ghost"
              class="self-start"
              :disabled="variations.length >= MAX_VARIATIONS"
              :label="t('page.marketing.builder.add_variation')"
              @click="addVariation"
            />
            <div class="overflow-hidden rounded-lg border border-default">
              <div
                class="flex items-center justify-between gap-2 border-b border-default px-3 py-1.5"
              >
                <DmsEyebrow
                  class="min-w-0 truncate"
                  :label="
                    t('page.marketing.builder.snippet_title', {
                      path: firstUrlStep,
                    })
                  "
                />
                <DmsCopyButton :value="snippet" />
              </div>
              <pre
                class="overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed text-toned"
                >{{ snippet }}</pre>
            </div>
            <DmsBanner
              v-if="!frozen"
              tone="primary"
              size="sm"
              icon="i-ph-lock-simple-open"
              :title="t('page.marketing.builder.draft_title')"
              :description="t('page.marketing.builder.draft_description')"
            />
          </template>
        </section>

        <div class="px-5 py-3">
          <DmsFormRequiredLegend />
        </div>
      </div>

      <aside class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
        <section class="dms-card p-0">
          <header
            class="flex items-center justify-between border-b border-default px-4 py-3"
          >
            <DmsEyebrow :label="t('page.marketing.builder.preview')" />
            <UIcon
              v-if="previewing"
              name="i-ph-circle-notch"
              class="size-4 animate-spin text-dimmed"
            />
          </header>
          <div class="flex flex-col gap-2 px-4 py-3">
            <p
              v-if="validSteps.length > 0 && !previewable"
              class="py-4 text-center text-sm text-muted"
            >
              {{ t('page.marketing.builder.preview_invalid') }}
            </p>
            <p
              v-else-if="previewFailed"
              class="py-4 text-center text-sm text-muted"
            >
              {{ t('page.marketing.builder.preview_error') }}
            </p>
            <p
              v-else-if="previewRows.length === 0"
              class="py-4 text-center text-sm text-muted"
            >
              {{ t('page.marketing.builder.preview_empty') }}
            </p>
            <template v-else>
              <div
                v-for="(row, index) in previewRows"
                :key="index"
                class="flex flex-col gap-1"
              >
                <div class="flex items-center gap-2 text-xs">
                  <span class="w-4 shrink-0 font-mono text-[11px] text-dimmed">
                    {{ index + 1 }}
                  </span>
                  <span
                    class="min-w-0 flex-1 truncate font-mono text-toned"
                    :title="row.step.value"
                  >
                    {{ row.step.value }}
                  </span>
                  <span
                    v-if="stepRate(index)"
                    class="shrink-0 font-mono text-[11px] text-dimmed"
                    :title="t('page.marketing.builder.step_rate')"
                  >
                    {{ stepRate(index) }}
                  </span>
                  <span
                    class="w-14 shrink-0 text-right font-mono font-semibold text-highlighted"
                  >
                    {{ formatNumber(row.sessions, locale) }}
                  </span>
                </div>
                <span
                  class="ms-6 h-1.5 overflow-hidden rounded-full bg-elevated"
                >
                  <span
                    class="block h-full rounded-full bg-primary"
                    :style="{
                      width: `${entered > 0 ? (row.sessions / entered) * 100 : 0}%`,
                    }"
                  />
                </span>
              </div>
              <div
                class="mt-2 flex items-center justify-between border-t border-default pt-2"
              >
                <span class="text-sm text-muted">
                  {{ t('page.marketing.builder.end_to_end') }}
                </span>
                <span class="font-mono text-sm font-semibold text-highlighted">
                  {{
                    endToEnd === null
                      ? '—'
                      : formatPercentage(
                          endToEnd / 100,
                          locale,
                          fractionDigits(1),
                        )
                  }}
                </span>
              </div>
            </template>
            <p
              v-if="splitEnabled && sampleHint"
              class="mt-1 flex gap-1.5 text-xs"
              :class="sampleHint.tooSmall ? 'text-warning' : 'text-muted'"
            >
              <UIcon name="i-ph-info" class="mt-0.5 size-3.5 shrink-0" />
              {{ t('page.marketing.builder.sample_hint', sampleHint) }}
            </p>
          </div>
        </section>

        <section class="dms-card p-0">
          <header class="border-b border-default px-4 py-3">
            <DmsEyebrow :label="t('page.marketing.builder.events_title')" />
          </header>
          <ul class="divide-y divide-default">
            <li
              v-for="event in suggestions.events.slice(0, 6)"
              :key="event.value"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-elevated/60"
                :aria-label="
                  t('page.marketing.builder.add_event_step', {
                    name: event.value,
                  })
                "
                @click="addStep('custom', event.value)"
              >
                <span
                  class="flex-1 truncate font-mono text-[13px] text-highlighted"
                >
                  {{ event.value }}
                </span>
                <span class="font-mono text-[11px] text-dimmed">
                  {{ formatNumber(event.count, locale) }}
                </span>
              </button>
            </li>
            <li
              v-if="suggestions.events.length === 0"
              class="px-4 py-4 text-center text-sm text-muted"
            >
              {{ t('page.marketing.builder.no_events') }}
            </li>
          </ul>
          <footer
            class="flex items-center gap-1.5 border-t border-default px-4 py-2.5 font-mono text-[11px] text-dimmed"
          >
            <UIcon name="i-ph-code" class="size-3.5 shrink-0" />
            <span class="min-w-0 break-words">
              {{ t('page.marketing.builder.events_hint') }}
            </span>
          </footer>
        </section>
      </aside>
    </div>

    <DmsSaveBar
      v-if="!loading && !loadFailed"
      :dirty="dirty"
      :saving="saving"
      :save-label="
        isEdit
          ? '$page.marketing.common.save_changes'
          : '$page.marketing.builder.save'
      "
      cancellable
      @save="save"
      @discard="discard"
      @cancel="leave(backLink)"
    />
  </div>
</template>
