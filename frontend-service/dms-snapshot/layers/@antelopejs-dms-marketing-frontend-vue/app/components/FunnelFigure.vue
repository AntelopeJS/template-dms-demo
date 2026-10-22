<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '#dms/frontend-module'
import type { MarketingFunnelResults } from '../composables/useMarketingApi'
import {
  funnelBuilderLink,
  overviewLink,
  pagesLink,
} from '../composables/useMarketingRoutes'
import { useContextLink } from '../composables/useContextLink'
import {
  formatNumber,
  formatShortDate,
  formatSignedDelta,
} from '../utils/format'
import { fractionDigits } from '../constants'

/**
 * The report of a plain funnel: KPIs (entered, completed, end to end, the
 * biggest loss), the sessions at each step with what each transition loses,
 * where to look next and the definition. It says when the numbers cannot be
 * read as they look: a site that sent nothing, a step it never sent, days or
 * a comparison the raw events do not cover.
 */
const props = defineProps<{
  results: MarketingFunnelResults
  loading: boolean
  websiteName: string
}>()

type Basis = 'entered' | 'previous'

const MIN_BAR_PERCENT = 6
const PERCENT = 100
const MS_PER_HOUR = 3_600_000

const { t, locale } = useI18n()

const basis = ref<Basis>('entered')

/** In the page's own context: the funnel's website and the period. */
const inContext = useContextLink()

const steps = computed(() => props.results.computation.steps)
const previous = computed(() => props.results.previous?.steps ?? null)
const entered = computed(() => steps.value[0]?.sessions ?? 0)
const completed = computed(() => steps.value.at(-1)?.sessions ?? 0)
const endToEnd = computed(() =>
  entered.value > 0 ? (completed.value / entered.value) * PERCENT : null,
)

/** The site sent no page view nor event at all over the period. */
const noTraffic = computed(() => props.results.computation.events === 0)

/** Steps no event of the period matched, while the site sent others; a
 * read cut at its cap concludes nothing. */
const unseen = computed(() =>
  noTraffic.value || props.results.truncated
    ? []
    : steps.value
        .filter((row) => row.matches === 0)
        .map((row) => row.step.value),
)

const coverage = computed(() => props.results.coverage ?? null)

const previousEntered = computed(() => previous.value?.[0]?.sessions)
const previousCompleted = computed(() => previous.value?.at(-1)?.sessions)
const previousEndToEnd = computed(() =>
  previousEntered.value
    ? ((previousCompleted.value ?? 0) / previousEntered.value) * PERCENT
    : null,
)

function change(
  current: number,
  before: number | undefined | null,
): number | null {
  return before ? ((current - before) / before) * PERCENT : null
}

interface Transition {
  index: number
  lost: number
  rate: number
}

const transitions = computed<Transition[]>(() =>
  steps.value.slice(0, -1).map((step, index) => {
    const next = steps.value[index + 1]?.sessions ?? 0
    const lost = Math.max(0, step.sessions - next)
    return {
      index,
      lost,
      rate: step.sessions > 0 ? (lost / step.sessions) * PERCENT : 0,
    }
  }),
)

/** The transition losing the largest share, among those losing anyone —
 * a loss before a step the site never sends is a tracking gap, not one. */
const worst = computed(() =>
  transitions.value.reduce<Transition | null>(
    (best, transition) =>
      transition.lost > 0 &&
      !unseen.value.includes(stepLabel(transition.index + 1)) &&
      (!best || transition.rate > best.rate)
        ? transition
        : best,
    null,
  ),
)

function stepLabel(index: number): string {
  return steps.value[index]?.step.value ?? ''
}

const kpis = computed(() => [
  {
    id: 'entered',
    icon: 'i-ph-sign-in',
    eyebrow: t('page.marketing.funnel.kpis.entered'),
    value: formatNumber(entered.value, locale.value),
    ...trend(change(entered.value, previousEntered.value), 'percent'),
  },
  {
    id: 'completed',
    icon: 'i-ph-flag-checkered',
    eyebrow: t('page.marketing.funnel.kpis.completed'),
    value: formatNumber(completed.value, locale.value),
    ...trend(change(completed.value, previousCompleted.value), 'percent'),
  },
  {
    id: 'end-to-end',
    icon: 'i-ph-percent',
    eyebrow: t('page.marketing.funnel.kpis.end_to_end'),
    value:
      endToEnd.value === null
        ? '—'
        : String(
            formatPercentage(
              endToEnd.value / 100,
              locale.value,
              fractionDigits(1),
            ),
          ),
    ...trend(
      endToEnd.value !== null && previousEndToEnd.value !== null
        ? endToEnd.value - previousEndToEnd.value
        : null,
      'points',
    ),
  },
  {
    id: 'biggest-loss',
    icon: 'i-ph-arrow-fat-down',
    tone: worst.value ? ('error' as const) : undefined,
    eyebrow: t('page.marketing.funnel.kpis.biggest_loss'),
    value: worst.value ? stepLabel(worst.value.index) : '—',
    detail: worst.value
      ? t('page.marketing.funnel.lost_rate', {
          rate: formatPercentage(
            worst.value.rate / 100,
            locale.value,
            fractionDigits(1),
          ),
          next: stepLabel(worst.value.index + 1),
        })
      : undefined,
    detailTone: worst.value ? ('error' as const) : undefined,
  },
])

function trend(delta: number | null, unit: 'percent' | 'points') {
  if (delta === null) {
    return {}
  }
  return {
    detail: `${formatSignedDelta(delta, unit, locale.value)} · ${t('page.marketing.context.vs_previous_short')}`,
    detailTone:
      Math.abs(delta) < 0.05
        ? ('neutral' as const)
        : delta > 0
          ? ('success' as const)
          : ('error' as const),
  }
}

function baseOf(index: number): number {
  return basis.value === 'entered' || index === 0
    ? entered.value
    : (steps.value[index - 1]?.sessions ?? 0)
}

function barPercent(sessions: number, index: number): number {
  const base = baseOf(index)
  return base > 0
    ? Math.max((sessions / base) * PERCENT, sessions > 0 ? MIN_BAR_PERCENT : 0)
    : 0
}

function shareLabel(sessions: number, index: number): string {
  const base = baseOf(index)
  return base > 0
    ? String(formatPercentage(sessions / base, locale.value, fractionDigits(1)))
    : '—'
}

/** What the share under a step is a share of; the goal's "converted" only
 * when it is a share of everyone who entered. */
function shareCaption(index: number): string {
  if (index === 0 || basis.value === 'entered') {
    return t(
      index === goalIndex.value && index > 0
        ? 'page.marketing.funnel.converted'
        : 'page.marketing.funnel.of_entered',
    )
  }
  return t('page.marketing.funnel.of_previous')
}

const basisItems = computed(() => [
  { value: 'entered', label: t('page.marketing.funnel.basis.entered') },
  { value: 'previous', label: t('page.marketing.funnel.basis.previous') },
])

const goalIndex = computed(() => steps.value.length - 1)

/** The first step's loss, as a split worth testing — unless it is the worst
 * one already named, or the funnel already carries a split. */
const firstDrop = computed(() => {
  const first = transitions.value[0]
  return first &&
    first.lost > 0 &&
    !props.results.funnel.experiment &&
    worst.value?.index !== 0
    ? first
    : null
})

const isDraft = computed(
  () => props.results.funnel.experiment?.status === 'draft',
)

const definition = computed(() => props.results.funnel)
const windowHours = computed(() =>
  Math.round(definition.value.conversionWindowMs / MS_PER_HOUR),
)

const coverageDate = computed(() =>
  coverage.value?.since
    ? formatShortDate(coverage.value.since, locale.value)
    : '',
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <DmsBanner
      v-if="isDraft"
      tone="info"
      size="sm"
      icon="i-ph-lock-simple-open"
      :title="t('page.marketing.funnel.draft_title')"
      :description="t('page.marketing.funnel.draft_description')"
    />
    <DmsBanner
      v-if="results.truncated"
      tone="warning"
      size="sm"
      icon="i-ph-hourglass"
      :title="t('page.marketing.funnel.truncated_title')"
      :description="t('page.marketing.funnel.truncated_description')"
    />
    <DmsBanner
      v-if="
        coverage && coverage.since && (coverage.period || coverage.previous)
      "
      tone="info"
      size="sm"
      icon="i-ph-clock-counter-clockwise"
      :title="
        coverage.period
          ? t('page.marketing.funnels.coverage.period_title', {
              date: coverageDate,
            })
          : t('page.marketing.funnels.coverage.previous_title')
      "
      :description="
        t('page.marketing.funnels.coverage.description', {
          date: coverageDate,
        })
      "
    />
    <DmsBanner
      v-for="step in unseen"
      :key="step"
      tone="warning"
      size="sm"
      icon="i-ph-warning"
      :title="
        t('page.marketing.funnel.unseen.title', {
          step,
          website: websiteName,
        })
      "
      :description="t('page.marketing.funnel.unseen.description')"
    />

    <DmsStatGroup :items="kpis" layout="cards" :columns="4" />

    <DmsEmptyState
      v-if="noTraffic"
      icon="i-ph-wifi-slash"
      hatched
      class="dms-card"
      :title="
        t('page.marketing.funnel.no_traffic.title', { website: websiteName })
      "
      :description="t('page.marketing.funnel.no_traffic.description')"
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-ph-chart-line"
          :label="t('page.marketing.funnel.no_traffic.overview')"
          :to="inContext(overviewLink())"
        />
      </template>
    </DmsEmptyState>

    <DmsEmptyState
      v-else-if="entered === 0"
      icon="i-ph-funnel"
      hatched
      class="dms-card"
      :title="t('page.marketing.funnel.empty.title')"
      :description="
        t('page.marketing.funnel.empty.description', { step: stepLabel(0) })
      "
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-ph-pencil-simple"
          :label="t('page.marketing.funnel.edit_steps')"
          :to="inContext(funnelBuilderLink(definition._id))"
        />
      </template>
    </DmsEmptyState>

    <section
      v-else
      class="dms-card overflow-hidden p-0"
      :class="loading ? 'opacity-70' : ''"
    >
      <header
        class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3"
      >
        <DmsEyebrow :label="t('page.marketing.funnel.figure_title')" />
        <DmsSegmented v-model="basis" :items="basisItems" size="xs" />
      </header>
      <ol class="flex flex-col px-4 py-3">
        <template v-for="(row, index) in steps" :key="index">
          <!-- Phone: number, step and share on a line, the bar under them.
               From md: one row, the bar between the step and the share. -->
          <li
            class="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 md:grid-cols-[2rem_minmax(10rem,16rem)_minmax(0,1fr)_7rem] md:gap-x-4"
          >
            <span
              class="grid size-7 place-items-center rounded-md font-mono text-xs"
              :class="
                index === goalIndex
                  ? 'bg-primary text-inverted'
                  : 'bg-elevated text-toned'
              "
            >
              <UIcon
                v-if="index === goalIndex"
                name="i-ph-flag-checkered"
                class="size-3.5"
              />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="min-w-0">
              <span
                class="block truncate font-mono text-[13px] text-highlighted"
                :title="row.step.value"
              >
                {{ row.step.value }}
              </span>
              <span
                class="flex flex-wrap items-center gap-x-1 text-xs text-dimmed"
              >
                <UIcon
                  :name="
                    row.step.kind === 'url' ? 'i-ph-browser' : 'i-ph-lightning'
                  "
                  class="size-3"
                />
                {{ t(`page.marketing.funnel.kind.${row.step.kind}`) }}
                <template v-if="index === goalIndex">
                  · {{ t('page.marketing.funnel.goal') }}
                </template>
                <template v-if="row.step.kind === 'url'">
                  ·
                  <DmsAutoLink
                    :to="inContext(pagesLink(row.step.value))"
                    class="text-primary hover:underline"
                  >
                    {{ t('page.marketing.funnel.see_clicks') }}
                  </DmsAutoLink>
                </template>
                <span
                  v-if="unseen.includes(row.step.value)"
                  class="inline-flex items-center gap-1 text-warning"
                >
                  ·
                  <UIcon name="i-ph-warning" class="size-3" />
                  {{ t('page.marketing.funnel.unseen.badge') }}
                </span>
              </span>
            </span>
            <span
              class="col-span-3 col-start-1 row-start-2 h-6 overflow-hidden rounded-md bg-elevated/60 md:col-span-1 md:col-start-3 md:row-start-1 md:h-8"
            >
              <span
                class="block h-full rounded-md bg-gradient-to-r from-primary/40 to-primary transition-[width] duration-500"
                :style="{ width: `${barPercent(row.sessions, index)}%` }"
              />
            </span>
            <span class="col-start-3 row-start-1 text-right md:col-start-4">
              <span
                class="block font-mono text-sm font-semibold tabular-nums text-highlighted"
              >
                {{ shareLabel(row.sessions, index) }}
              </span>
              <span
                class="block font-mono text-[10px] whitespace-nowrap text-dimmed"
              >
                {{
                  t(
                    'page.marketing.funnel.sessions_count',
                    { count: formatNumber(row.sessions, locale) },
                    row.sessions,
                  )
                }}
              </span>
              <span
                class="block font-mono text-[10px] whitespace-nowrap text-dimmed"
              >
                {{ shareCaption(index) }}
              </span>
            </span>
          </li>
          <li
            v-if="transitions[index]"
            class="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 md:grid-cols-[2rem_minmax(10rem,16rem)_minmax(0,1fr)_7rem] md:gap-x-4"
          >
            <span class="mx-auto h-6 w-px bg-(--ui-border)" />
            <span class="hidden md:block" />
            <span class="min-w-0">
              <span
                class="inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded border px-2 py-0.5 font-mono text-[11px]"
                :class="
                  transitions[index]!.lost > 0
                    ? 'border-error/30 bg-error/10 text-error'
                    : 'border-default text-dimmed'
                "
              >
                <UIcon name="i-ph-arrow-down" class="size-3" />
                {{
                  t(
                    'page.marketing.funnel.lost',
                    {
                      count: formatNumber(transitions[index]!.lost, locale),
                      rate: formatPercentage(
                        transitions[index]!.rate / 100,
                        locale,
                        fractionDigits(1),
                      ),
                    },
                    transitions[index]!.lost,
                  )
                }}
                <template v-if="worst && worst.index === index">
                  · {{ t('page.marketing.funnel.worst_step') }}
                </template>
              </span>
            </span>
          </li>
        </template>
      </ol>
      <footer
        class="flex items-start gap-1.5 border-t border-default px-4 py-2.5 text-xs text-dimmed"
      >
        <UIcon name="i-ph-info" class="mt-0.5 size-3.5 shrink-0" />
        {{ t('page.marketing.funnel.figure_note', { hours: windowHours }) }}
      </footer>
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <section v-if="!noTraffic" class="dms-card p-0">
        <header class="border-b border-default px-4 py-3">
          <DmsEyebrow :label="t('page.marketing.funnel.next.title')" />
        </header>
        <ul class="divide-y divide-default">
          <li v-if="worst" class="flex items-start gap-3 px-4 py-3">
            <DmsIconWell icon="i-ph-browser" tone="error" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-highlighted">
                {{
                  t('page.marketing.funnel.next.worst', {
                    rate: formatPercentage(
                      worst.rate / 100,
                      locale,
                      fractionDigits(1),
                    ),
                    step: stepLabel(worst.index),
                  })
                }}
              </span>
              <span class="block text-xs text-muted">
                {{ t('page.marketing.funnel.next.worst_hint') }}
              </span>
            </span>
            <DmsAutoLink
              v-if="steps[worst.index]?.step.kind === 'url'"
              :to="inContext(pagesLink(stepLabel(worst.index)))"
              class="font-mono text-xs text-primary hover:underline"
            >
              {{ t('page.marketing.funnel.next.heatmap') }}
            </DmsAutoLink>
          </li>
          <li v-if="firstDrop" class="flex items-start gap-3 px-4 py-3">
            <DmsIconWell icon="i-ph-flask" tone="warning" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-highlighted">
                {{
                  t('page.marketing.funnel.next.first', {
                    rate: formatPercentage(
                      firstDrop.rate / 100,
                      locale,
                      fractionDigits(1),
                    ),
                    step: stepLabel(1),
                  })
                }}
              </span>
              <span class="block text-xs text-muted">
                {{
                  t('page.marketing.funnel.next.first_hint', {
                    step: stepLabel(0),
                  })
                }}
              </span>
            </span>
            <DmsAutoLink
              :to="
                inContext(funnelBuilderLink(definition._id, { split: true }))
              "
              class="font-mono text-xs text-primary hover:underline"
            >
              {{ t('page.marketing.funnel.next.split') }}
            </DmsAutoLink>
          </li>
          <li v-if="!worst" class="px-4 py-6 text-center text-sm text-muted">
            {{
              t(
                unseen.length > 0
                  ? 'page.marketing.funnel.next.unseen'
                  : entered === 0
                    ? 'page.marketing.funnel.next.nobody'
                    : 'page.marketing.funnel.next.none',
              )
            }}
          </li>
        </ul>
      </section>

      <section class="dms-card p-0" :class="noTraffic ? 'lg:col-span-2' : ''">
        <header
          class="flex items-center justify-between border-b border-default px-4 py-3"
        >
          <DmsEyebrow :label="t('page.marketing.funnel.definition.title')" />
          <DmsAutoLink
            :to="inContext(funnelBuilderLink(definition._id))"
            class="text-xs font-medium text-primary hover:underline"
          >
            {{ t('page.marketing.common.edit') }}
          </DmsAutoLink>
        </header>
        <dl
          class="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <dt class="text-muted">
            {{ t('page.marketing.funnel.definition.website') }}
          </dt>
          <dd class="text-highlighted">{{ websiteName || '—' }}</dd>
          <dt class="text-muted">
            {{ t('page.marketing.funnel.definition.steps') }}
          </dt>
          <dd class="flex flex-wrap items-center gap-1">
            <template v-for="(step, index) in definition.steps" :key="index">
              <UIcon
                v-if="index > 0"
                name="i-ph-caret-right"
                class="size-3 text-dimmed"
              />
              <span
                class="max-w-full truncate rounded border px-1.5 py-0.5 font-mono text-[11px]"
                :class="
                  step.kind === 'custom'
                    ? 'border-primary/40 text-primary'
                    : 'border-default text-toned'
                "
              >
                {{ step.value }}
              </span>
            </template>
          </dd>
          <dt class="text-muted">
            {{ t('page.marketing.funnel.definition.window') }}
          </dt>
          <dd class="text-highlighted">
            {{
              t('page.marketing.funnel.definition.window_value', {
                hours: windowHours,
              })
            }}
          </dd>
        </dl>
      </section>
    </div>
  </div>
</template>
