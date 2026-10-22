<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#dms/frontend-module'
import type {
  MarketingFunnelResults,
  MarketingVariationResult,
} from '../composables/useMarketingApi'
import { pagesLink } from '../composables/useMarketingRoutes'
import { useContextLink } from '../composables/useContextLink'
import { formatNumber } from '../utils/format'
import {
  localizedSnippetComments,
  variationSnippet,
} from '../utils/funnel-draft'
import { fractionDigits } from '../constants'

/**
 * The report of a started A/B test, read over its own runs: the verdict as a
 * sentence with its next action, lift with its interval, p-value and sample
 * size beside it; the warnings that void a reading above the numbers; each
 * arm step by step; the frozen variations and the code that asks for one.
 *
 * A significant reading is only "ready to decide" past the decision rule (a
 * full week served, a conversions floor in every arm): checked every day, a
 * p-value crosses .05 by chance long before. Before that it is "too early".
 *
 * Arms keep an identity colour everywhere (A neutral, B primary, then the
 * other tones): green and red only ever mean a verdict.
 */
const props = defineProps<{
  results: MarketingFunnelResults
  loading: boolean
  websiteName: string
}>()

const LETTER_A = 65
const PERCENT = 100
const MIN_OUTCOMES = 5
const SMALL_P = 0.001

// On a 15% tint the light theme's 700 text falls under 4.5:1: one shade darker
// there, the theme colour in dark.
const ARM_STYLES = [
  { chip: 'bg-elevated text-toned', bar: 'bg-(--ui-text-dimmed)' },
  {
    chip: 'bg-primary/15 text-(--ui-color-primary-800) dark:text-primary',
    bar: 'bg-primary',
  },
  {
    chip: 'bg-warning/15 text-(--ui-color-warning-800) dark:text-warning',
    bar: 'bg-warning',
  },
  {
    chip: 'bg-info/15 text-(--ui-color-info-800) dark:text-info',
    bar: 'bg-info',
  },
]

const { t, locale } = useI18n()
const inContext = useContextLink()

const experiment = computed(() => props.results.experiment ?? null)
const definition = computed(() => props.results.funnel.experiment!)
const arms = computed(() => experiment.value?.variations ?? [])
const stopped = computed(() => definition.value.status === 'stopped')
const decision = computed(() => experiment.value?.decision ?? null)

function letter(index: number): string {
  return String.fromCharCode(LETTER_A + index)
}

function armStyle(index: number) {
  return ARM_STYLES[index % ARM_STYLES.length]!
}

function goalSessions(arm: MarketingVariationResult): number {
  return arm.computation.steps.at(-1)?.sessions ?? 0
}

const control = computed(() => arms.value[0] ?? null)

/** The server's reading: the challenger it names (best rate among those that
 * got a p-value — the list names the same one) and its verdict. */
const verdict = computed(() => props.results.verdict ?? null)

const bestIndex = computed(() => verdict.value?.leader ?? -1)

const best = computed(() =>
  bestIndex.value === -1 ? null : (arms.value[bestIndex.value] ?? null),
)

const totalExposed = computed(() =>
  arms.value.reduce((sum, arm) => sum + arm.exposedSessions, 0),
)

/** Nobody was exposed since the start: the page does not ask for an arm. */
const noExposure = computed(
  () => arms.value.length > 0 && totalExposed.value === 0,
)

const insufficient = computed(
  () =>
    !noExposure.value &&
    !props.results.truncated &&
    arms.value.length > 0 &&
    arms.value.slice(1).every((arm) => arm.significant === null),
)

const srmMismatch = computed(() => experiment.value?.srm.mismatch === true)

/** The level each challenger is tested at, in percent (95, or more past two
 * arms). */
const level = computed(() =>
  formatNumber(
    (1 - (experiment.value?.alpha ?? 0.05)) * PERCENT,
    locale.value,
    1,
  ).replace(/[.,]0$/, ''),
)

const verdictKind = computed(() => verdict.value?.kind ?? 'withheld')

const lift = computed(() => (best.value?.uplift ?? 0) * PERCENT)

function signed(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : '−'}${formatPercentage(Math.abs(value) / 100, locale.value, fractionDigits(digits))}`
}

const interval = computed(() => {
  const arm = best.value
  if (!arm || arm.upliftLow === null || arm.upliftHigh === null) {
    return ''
  }
  return t('page.marketing.experiment.lift_interval', {
    level: level.value,
    low: signed(arm.upliftLow * PERCENT, 0),
    high: signed(arm.upliftHigh * PERCENT, 0),
  })
})

const pValueText = computed(() => {
  const p = best.value?.pValue
  if (p === null || p === undefined) {
    return '—'
  }
  return p < SMALL_P
    ? `< ${formatNumber(SMALL_P, locale.value, 3)}`
    : formatNumber(p, locale.value, 3)
})

const goal = computed(() => props.results.funnel.steps.at(-1)?.value ?? '')

const headline = computed(() => {
  const params = {
    letter: letter(bestIndex.value),
    lift: formatPercentage(
      Math.abs(lift.value) / 100,
      locale.value,
      fractionDigits(1),
    ),
  }
  return t(`page.marketing.experiment.verdict.${verdictKind.value}`, params)
})

const explanation = computed(() => {
  if (!best.value || !control.value) {
    return ''
  }
  const kind = verdictKind.value
  const stoppedKind =
    stopped.value && kind !== 'withheld' && kind !== 'early'
      ? `${kind}_detail_stopped`
      : `${kind}_detail`
  const days = Math.floor(decision.value?.days ?? 0)
  return t(`page.marketing.experiment.verdict.${stoppedKind}`, {
    goal: goal.value,
    best: formatPercentage(
      best.value.conversionRate,
      locale.value,
      fractionDigits(2),
    ),
    control: formatPercentage(
      control.value.conversionRate,
      locale.value,
      fractionDigits(2),
    ),
    letter: letter(bestIndex.value),
    key: best.value.key,
    experiment: definition.value.key,
    days,
    minDays: decision.value?.minDays ?? 0,
    minConversions: decision.value?.minConversions ?? 0,
  })
})

const maxRate = computed(() =>
  Math.max(0.0001, ...arms.value.map((arm) => arm.conversionRate)),
)

const weights = computed(() => {
  const total =
    definition.value.variations.reduce(
      (sum, arm) => sum + Math.max(arm.weight, 0),
      0,
    ) || 1
  return definition.value.variations.map(
    (arm) => (Math.max(arm.weight, 0) / total) * PERCENT,
  )
})

const srmLine = computed(() => {
  const srm = experiment.value?.srm
  if (!srm || totalExposed.value === 0) {
    return ''
  }
  const observed = arms.value
    .map((arm) =>
      formatNumber(
        (arm.exposedSessions / totalExposed.value) * PERCENT,
        locale.value,
        1,
      ),
    )
    .join(' / ')
  const expected = weights.value
    .map((weight) => formatNumber(weight, locale.value, 0))
    .join(' / ')
  return t(
    srm.mismatch
      ? 'page.marketing.experiment.srm_failed'
      : 'page.marketing.experiment.srm_passed',
    { observed, expected },
  )
})

function stepShare(arm: MarketingVariationResult, stepIndex: number): number {
  const sessions = arm.computation.steps[stepIndex]?.sessions ?? 0
  return arm.exposedSessions > 0
    ? (sessions / arm.exposedSessions) * PERCENT
    : 0
}

function stepLift(
  arm: MarketingVariationResult,
  stepIndex: number,
): number | null {
  const base = control.value ? stepShare(control.value, stepIndex) : 0
  return base > 0 ? ((stepShare(arm, stepIndex) - base) / base) * PERCENT : null
}

// The builder's snippet: no top-level await, comments in the reader's language.
const snippet = computed(() =>
  variationSnippet(
    definition.value.key,
    definition.value.variations[0]?.key ?? 'control',
    definition.value.variations.slice(1).map((arm) => arm.key),
    localizedSnippetComments(t),
  ),
)

const withheldCounts = computed(() =>
  arms.value.map((arm, index) => ({
    key: arm.key,
    letter: letter(index),
    exposed: arm.exposedSessions,
    goal: goalSessions(arm),
  })),
)
</script>

<template>
  <div class="flex flex-col gap-4" :class="loading ? 'opacity-80' : ''">
    <DmsBanner
      v-if="srmMismatch"
      tone="error"
      icon="i-ph-scales"
      :title="t('page.marketing.experiment.srm_title')"
      :description="srmLine"
    />
    <DmsBanner
      v-if="results.truncated"
      tone="warning"
      icon="i-ph-hourglass"
      :title="t('page.marketing.experiment.truncated_title')"
      :description="t('page.marketing.experiment.truncated_description')"
    />

    <section v-if="noExposure" class="dms-card flex flex-col gap-3 p-5">
      <DmsStatusPill
        :tone="stopped ? 'neutral' : 'warning'"
        icon="i-ph-eye-slash"
        :mono="false"
        :label="t('page.marketing.experiment.no_exposure_badge')"
      />
      <h2 class="text-lg font-semibold text-highlighted">
        {{
          t('page.marketing.experiment.no_exposure_title', {
            website: websiteName,
          })
        }}
      </h2>
      <p class="text-sm text-muted">
        {{
          t('page.marketing.experiment.no_exposure_description', {
            key: definition.key,
          })
        }}
      </p>
    </section>

    <section v-else-if="insufficient" class="dms-card flex flex-col gap-3 p-5">
      <DmsStatusPill
        tone="neutral"
        icon="i-ph-hourglass"
        :mono="false"
        :label="t('page.marketing.experiment.insufficient_badge')"
      />
      <h2 class="text-lg font-semibold text-highlighted">
        {{ t('page.marketing.experiment.insufficient_title') }}
      </h2>
      <p class="text-sm text-muted">
        {{
          t('page.marketing.experiment.insufficient_description', {
            count: MIN_OUTCOMES,
          })
        }}
      </p>
      <ul class="flex flex-col gap-1.5">
        <li
          v-for="arm in withheldCounts"
          :key="arm.key"
          class="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-sm"
        >
          <span
            class="grid size-5 place-items-center rounded text-[10px] font-semibold"
            :class="armStyle(arm.letter.charCodeAt(0) - LETTER_A).chip"
          >
            {{ arm.letter }}
          </span>
          <span class="w-28 truncate text-highlighted">{{ arm.key }}</span>
          <span class="text-muted">
            {{
              t('page.marketing.experiment.raw_counts', {
                exposed: formatNumber(arm.exposed, locale),
                goal: formatNumber(arm.goal, locale),
              })
            }}
          </span>
        </li>
      </ul>
    </section>

    <section
      v-else
      class="dms-card grid overflow-hidden p-0 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]"
    >
      <div
        class="flex flex-col gap-3 p-5"
        :class="
          verdictKind === 'winner'
            ? 'bg-success/5'
            : verdictKind === 'loser'
              ? 'bg-error/5'
              : ''
        "
      >
        <div class="flex flex-wrap items-center gap-2">
          <DmsStatusPill
            :tone="
              verdictKind === 'winner'
                ? 'success'
                : verdictKind === 'loser'
                  ? 'error'
                  : 'neutral'
            "
            :icon="
              verdictKind === 'flat' || verdictKind === 'withheld'
                ? 'i-ph-minus-circle'
                : 'i-ph-check-circle'
            "
            :mono="false"
            :label="
              t(
                verdictKind === 'flat' || verdictKind === 'withheld'
                  ? 'page.marketing.experiment.not_significant'
                  : 'page.marketing.experiment.significant',
                { level },
              )
            "
          />
          <DmsStatusPill
            v-if="verdictKind === 'winner' && definition.status === 'running'"
            tone="neutral"
            :mono="false"
            :label="t('page.marketing.experiment.ready')"
          />
          <DmsStatusPill
            v-else-if="verdictKind === 'early'"
            tone="info"
            icon="i-ph-hourglass"
            :mono="false"
            :label="t('page.marketing.experiment.too_early')"
          />
        </div>
        <h2 class="text-xl font-semibold text-balance text-highlighted">
          {{ headline }}
        </h2>
        <p class="text-sm text-muted">{{ explanation }}</p>
        <ul class="mt-1 flex flex-col gap-2">
          <li
            v-for="(arm, index) in arms"
            :key="arm.key"
            class="grid grid-cols-[1.25rem_minmax(0,6rem)_minmax(0,1fr)_4rem] items-center gap-2 sm:grid-cols-[1.25rem_7rem_minmax(0,1fr)_4rem] sm:gap-3"
          >
            <span
              class="grid size-5 place-items-center rounded font-mono text-[10px] font-semibold"
              :class="armStyle(index).chip"
            >
              {{ letter(index) }}
            </span>
            <span class="truncate font-mono text-[13px] text-highlighted">
              {{ arm.key }}
            </span>
            <span class="h-2 overflow-hidden rounded-full bg-elevated">
              <span
                class="block h-full rounded-full"
                :class="armStyle(index).bar"
                :style="{ width: `${(arm.conversionRate / maxRate) * 100}%` }"
              />
            </span>
            <span
              class="text-right font-mono text-[13px] font-semibold tabular-nums text-highlighted"
            >
              {{
                formatPercentage(arm.conversionRate, locale, fractionDigits(2))
              }}
            </span>
          </li>
        </ul>
      </div>
      <div
        class="flex flex-col gap-1 border-t border-default p-5 lg:border-t-0 lg:border-l"
      >
        <DmsEyebrow :label="t('page.marketing.experiment.lift')" />
        <span
          class="text-3xl font-semibold tabular-nums"
          :class="
            verdictKind === 'winner'
              ? 'text-success'
              : verdictKind === 'loser'
                ? 'text-error'
                : 'text-highlighted'
          "
        >
          {{ best ? signed(lift) : '—' }}
        </span>
        <span class="font-mono text-[11px] text-dimmed">
          {{
            t('page.marketing.experiment.lift_hint', {
              letter: letter(bestIndex),
            })
          }}
        </span>
        <span v-if="interval" class="font-mono text-[11px] text-muted">
          {{ interval }}
        </span>
      </div>
      <div
        class="flex flex-col gap-1 border-t border-default p-5 lg:border-t-0 lg:border-l"
      >
        <DmsEyebrow :label="t('page.marketing.experiment.p_value')" />
        <span class="text-3xl font-semibold tabular-nums text-highlighted">
          {{ pValueText }}
        </span>
        <span class="font-mono text-[11px] text-dimmed">
          {{
            t('page.marketing.experiment.p_value_hint', {
              alpha: formatNumber(experiment?.alpha ?? 0.05, locale, 3).replace(
                /0+$/,
                '',
              ),
            })
          }}
        </span>
      </div>
      <div
        class="flex flex-col gap-1 border-t border-default p-5 lg:border-t-0 lg:border-l"
      >
        <DmsEyebrow :label="t('page.marketing.experiment.exposed')" />
        <span class="text-3xl font-semibold tabular-nums text-highlighted">
          {{ formatNumber(totalExposed, locale) }}
        </span>
        <span class="font-mono text-[11px] text-dimmed">
          {{
            arms
              .map(
                (arm, index) =>
                  `${formatNumber(arm.exposedSessions, locale)} ${letter(index)}`,
              )
              .join(' · ')
          }}
        </span>
        <span v-if="decision" class="font-mono text-[11px] text-muted">
          {{
            t(
              'page.marketing.experiment.days_served',
              { days: Math.floor(decision.days) },
              Math.floor(decision.days),
            )
          }}
        </span>
      </div>
      <footer
        v-if="srmLine && !srmMismatch"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-default px-5 py-2.5 text-xs text-dimmed lg:col-span-4"
      >
        <span class="flex items-center gap-1.5">
          <UIcon name="i-ph-scales" class="size-3.5" />
          {{ srmLine }}
        </span>
      </footer>
    </section>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <section class="dms-card min-w-0 overflow-hidden p-0">
        <header
          class="flex items-center justify-between gap-3 border-b border-default px-4 py-3"
        >
          <DmsEyebrow :label="t('page.marketing.experiment.steps_title')" />
          <span class="flex gap-1">
            <span
              v-for="(arm, index) in arms"
              :key="arm.key"
              class="grid size-5 place-items-center rounded font-mono text-[10px] font-semibold"
              :class="armStyle(index).chip"
            >
              {{ letter(index) }}
            </span>
          </span>
        </header>
        <ol class="divide-y divide-default">
          <!-- Phone: the step on its own line, the arms under it full width.
               From md: the step beside its arms. -->
          <li
            v-for="(step, stepIndex) in results.funnel.steps"
            :key="stepIndex"
            class="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[2rem_minmax(8rem,14rem)_minmax(0,1fr)] md:gap-x-4"
          >
            <span
              class="grid size-7 place-items-center rounded-md font-mono text-xs"
              :class="
                stepIndex === results.funnel.steps.length - 1
                  ? 'bg-primary text-inverted'
                  : 'bg-elevated text-toned'
              "
            >
              <UIcon
                v-if="stepIndex === results.funnel.steps.length - 1"
                name="i-ph-flag-checkered"
                class="size-3.5"
              />
              <template v-else>{{ stepIndex + 1 }}</template>
            </span>
            <span class="min-w-0">
              <span
                class="block truncate font-mono text-[13px] text-highlighted"
                :title="step.value"
              >
                {{ step.value }}
              </span>
              <span class="flex items-center gap-1 text-xs text-dimmed">
                {{ t(`page.marketing.funnel.kind.${step.kind}`) }}
                <template v-if="step.kind === 'url'">
                  ·
                  <DmsAutoLink
                    :to="inContext(pagesLink(step.value))"
                    class="text-primary hover:underline"
                  >
                    {{ t('page.marketing.funnel.see_clicks') }}
                  </DmsAutoLink>
                </template>
              </span>
            </span>
            <span class="col-span-2 flex flex-col gap-1.5 md:col-span-1">
              <span
                v-for="(arm, index) in arms"
                :key="arm.key"
                class="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2"
              >
                <span
                  class="grid size-5 place-items-center rounded font-mono text-[10px] font-semibold"
                  :class="armStyle(index).chip"
                >
                  {{ letter(index) }}
                </span>
                <span class="h-2 overflow-hidden rounded-full bg-elevated">
                  <span
                    class="block h-full rounded-full"
                    :class="armStyle(index).bar"
                    :style="{ width: `${stepShare(arm, stepIndex)}%` }"
                  />
                </span>
                <!-- Nobody exposed to the arm: no share to give, not 0 %. -->
                <span
                  v-if="arm.exposedSessions === 0"
                  class="min-w-[7.5rem] text-right font-mono text-[11px] text-dimmed"
                >
                  —
                </span>
                <span
                  v-else
                  class="min-w-[7.5rem] text-right font-mono text-[11px] whitespace-nowrap tabular-nums"
                >
                  <span class="font-semibold text-highlighted">
                    {{
                      formatNumber(
                        arm.computation.steps[stepIndex]?.sessions ?? 0,
                        locale,
                      )
                    }}
                  </span>
                  <span class="ms-1 text-dimmed">
                    {{
                      formatPercentage(
                        stepShare(arm, stepIndex) / 100,
                        locale,
                        fractionDigits(stepShare(arm, stepIndex) < 10 ? 2 : 1),
                      )
                    }}
                  </span>
                  <span
                    v-if="
                      index > 0 &&
                      stepIndex > 0 &&
                      stepLift(arm, stepIndex) !== null
                    "
                    class="ms-1 text-toned"
                  >
                    {{ signed(stepLift(arm, stepIndex) ?? 0, 0) }}
                  </span>
                </span>
              </span>
            </span>
          </li>
        </ol>
        <footer
          class="flex items-start gap-1.5 border-t border-default px-4 py-2.5 text-xs text-dimmed"
        >
          <UIcon name="i-ph-info" class="mt-0.5 size-3.5 shrink-0" />
          {{ t('page.marketing.experiment.colours_note') }}
        </footer>
      </section>

      <div class="flex min-w-0 flex-col gap-4">
        <section class="dms-card p-0">
          <header
            class="flex items-center justify-between border-b border-default px-4 py-3"
          >
            <DmsEyebrow :label="t('page.marketing.experiment.variations')" />
            <DmsStatusPill
              size="sm"
              icon="i-ph-lock-simple"
              :mono="false"
              :label="t('page.marketing.experiment.frozen')"
            />
          </header>
          <ul class="flex flex-col gap-2 px-4 py-3">
            <li
              v-for="(arm, index) in definition.variations"
              :key="arm.key"
              class="flex items-center gap-3"
            >
              <span
                class="grid size-5 place-items-center rounded font-mono text-[10px] font-semibold"
                :class="armStyle(index).chip"
              >
                {{ letter(index) }}
              </span>
              <span class="truncate font-mono text-sm text-highlighted">
                {{ arm.key }}
              </span>
              <span
                v-if="index === 0"
                class="font-mono text-[11px] text-dimmed"
              >
                {{ t('page.marketing.experiment.control_arm') }}
              </span>
              <span class="ms-auto font-mono text-sm text-muted">
                {{
                  formatPercentage(
                    (weights[index] ?? 0) / 100,
                    locale,
                    fractionDigits(0),
                  )
                }}
              </span>
            </li>
          </ul>
        </section>
        <section class="dms-card p-0">
          <header class="border-b border-default px-4 py-3">
            <DmsEyebrow
              :label="
                t(
                  stopped
                    ? 'page.marketing.experiment.on_site_stopped'
                    : 'page.marketing.experiment.on_site',
                )
              "
            />
          </header>
          <div class="flex flex-col gap-2 p-4">
            <p v-if="stopped" class="text-xs text-muted">
              {{
                t('page.marketing.experiment.on_site_stopped_hint', {
                  key: definition.key,
                })
              }}
            </p>
            <div class="overflow-hidden rounded-lg border border-default">
              <div
                class="flex items-center justify-between border-b border-default px-3 py-1.5"
              >
                <DmsEyebrow label="JavaScript" />
                <DmsCopyButton :value="snippet" />
              </div>
              <pre
                class="px-3 py-2.5 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-toned"
                >{{ snippet }}</pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
