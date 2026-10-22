<script setup lang="ts">
import { computed, watch } from 'vue'
import {
  durationParts,
  formatClock,
  formatCount,
  formatDecimal,
  formatFullDateTime,
  formatMs,
  formatPercent,
  formatRelativeDay,
  formatThreshold,
  spanPart,
} from '../../utils/format'

// The verdict leads the Overview: is the API healthy, since when, why not,
// and the one action that starts the investigation. The verdict and its
// figures cover a short window (the last `thresholds.windowMinutes`), so the
// hero says what is happening now and comes back to Healthy once an incident
// is over. With no request captured yet, the same place explains how to get
// the first one in. It follows the page's Direct / Pause state (`usePageLive`,
// the DMS `LiveToggle`): read again on the live feed and every minute in
// Direct, still while paused. A change
// of verdict seen live is told in a toast, and an unhealthy verdict shows in
// the browser tab.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  fetchUrl: string
  /** The live feed (`LIVE_REQUESTS_TOPIC`): the verdict is read again on it. */
  realtimeTopic?: string
}>()

type Verdict = 'down' | 'degraded' | 'recovered' | 'operational' | 'idle'

/** Rates in percent (0–100); the figures cover the last `windowMinutes`. */
interface HealthMetrics {
  serverErrorRate: number
  clientErrorRate: number
  /** Null when no call was measured in the window. */
  p95Ms: number | null
  requestsPerMinute: number
}

/** Rates in percent, like the metrics. */
interface HealthThresholds {
  /** Degraded from this 5xx rate over `windowMinutes`. */
  degradedServerErrorRate: number
  /** Down from this 5xx rate over `downWindowMinutes`. */
  downServerErrorRate: number
  windowMinutes: number
  downWindowMinutes: number
  /** How far back the verdict looks for an incident. */
  lookbackMinutes: number
  /** The slow threshold of the settings: a p95 from it is slow. */
  slowThresholdMs: number
}

/** What one rule reads now, over its own window. */
interface RuleWindow {
  minutes: number
  requests: number
  serverErrors: number
  serverErrorRate: number
}

interface HealthPayload {
  verdict: Verdict
  /** Start of the current incident, or of the last one. */
  incidentStart: string | null
  /** How long the verdict has held; null when longer than the lookback. */
  durationMs: number | null
  checkedAt: string
  metrics: HealthMetrics
  /** The degraded and down rules' windows; null without any call. */
  ruleWindows: { degraded: RuleWindow; down: RuleWindow } | null
  thresholds: HealthThresholds
  failingRoutes: number
  recoveredRoutes: number
  slowRoutes: number
  serverErrors: number
  routes: { value: number; needingAttention: number }
  serverErrorsLink: string
  firstRun: boolean
}

type MetricTone = 'default' | 'warning' | 'error' | 'muted'

interface HeroMetric {
  id: string
  label: string
  value: string
  unit?: string
  sub: string
  tone: MetricTone
  /** A figure of context: smaller, and grey whatever its value. */
  secondary?: boolean
}

interface VerdictLook {
  icon: string
  text: string
  dot: string
  tint: string
  line: string
}

const MS_PER_MINUTE = 60_000

const OK_LOOK = {
  text: 'text-highlighted',
  dot: 'bg-success',
  tint: 'var(--dms-success-tint)',
  line: 'var(--dms-success-line)',
}

const LOOKS: Record<Verdict, VerdictLook> = {
  operational: { ...OK_LOOK, icon: 'i-ph-check-circle' },
  recovered: { ...OK_LOOK, icon: 'i-ph-arrow-counter-clockwise' },
  degraded: {
    icon: 'i-ph-warning',
    text: 'text-warning',
    dot: 'bg-warning',
    tint: 'var(--dms-warning-tint)',
    line: 'var(--dms-warning-line)',
  },
  down: {
    icon: 'i-ph-x-circle',
    text: 'text-error',
    dot: 'bg-error',
    tint: 'var(--dms-error-tint)',
    line: 'var(--dms-error-line)',
  },
  idle: {
    icon: 'i-ph-info',
    text: 'text-info',
    dot: 'bg-info',
    tint: 'var(--dms-info-tint)',
    line: 'var(--dms-info-line)',
  },
}

const RING_TEXT: Record<Verdict, string> = {
  operational: 'text-success',
  recovered: 'text-success',
  degraded: 'text-warning',
  down: 'text-error',
  idle: 'text-info',
}

const METRIC_TONE: Record<MetricTone, string> = {
  default: 'text-highlighted',
  warning: 'text-warning',
  error: 'text-error',
  muted: 'text-muted',
}

const { t } = useI18n()
const { formatLocale: locale } = useRegionalFormat({ locale: 'format' })
const dateFormat = useDateFormat()
const toast = useToast()
const { isLive } = usePageLive()
const { data, error, pending, refresh } = useApiData<HealthPayload>(
  () => props.fetchUrl,
  { refreshOnPageRefresh: false },
)

// Read again on the live feed at the page's pace, and after a quiet minute:
// the verdict judges time too. Never while paused.
usePageLiveRefresh(() => void refresh(), {
  realtimeTopic: props.realtimeTopic,
  idleRefresh: 60,
})

/** Refresh reads the whole page again, not this block alone. */
function refreshPage() {
  refreshPageBlocks()
}

const UNHEALTHY: Verdict[] = ['degraded', 'down']
const TOAST_COLORS: Record<Verdict, 'error' | 'warning' | 'success' | 'info'> =
  {
    down: 'error',
    degraded: 'warning',
    recovered: 'success',
    operational: 'success',
    idle: 'info',
  }

const verdictLabel = (verdict: Verdict) => t(`api.health.verdict.${verdict}`)

// A verdict that changes under the user's eyes: said once, in a toast.
watch(
  () => data.value?.verdict,
  (next, previous) => {
    if (!next || !previous || next === previous) return
    toast.add({
      title: t('api.live_mode.verdict.title', { verdict: verdictLabel(next) }),
      description: t('api.live_mode.verdict.description', {
        previous: verdictLabel(previous),
      }),
      color: TOAST_COLORS[next],
      icon: LOOKS[next].icon,
    })
  },
)

// "● Degraded · Overview" in the browser tab while the API is unhealthy.
useHead({
  title: computed(() => {
    const verdict = data.value?.verdict
    return verdict && UNHEALTHY.includes(verdict)
      ? t('api.live_mode.verdict.tab', {
          verdict: verdictLabel(verdict),
          page: t('api.overview.title'),
        })
      : undefined
  }),
})

const count = (value: number) => formatCount(value, locale.value)
const rate = (value: number) => formatPercent(value, locale.value)

/** "38 min", "2 h 5 min": the parts worded in the interface language. */
function duration(ms: number): string {
  return durationParts(ms)
    .map(({ amount, unit }) =>
      t(`api.health.duration.${unit}`, { n: count(amount) }),
    )
    .join(' ')
}

/** How long the verdict has held: "for 38 min", or longer than the lookback. */
function heldFor(health: HealthPayload): string {
  if (health.durationMs !== null) {
    return t('api.health.for', { duration: duration(health.durationMs) })
  }
  const { amount, unit } = spanPart(
    health.thresholds.lookbackMinutes * MS_PER_MINUTE,
  )
  return t('api.health.for_over', {
    duration: t(`api.health.duration.${unit}`, { n: count(amount) }),
  })
}

// A failed refresh keeps the last figures on screen: they are no longer live.
const stale = computed(() => !!error.value && !!data.value)
const staleSince = computed(() =>
  data.value ? formatClock(data.value.checkedAt, dateFormat.value) : '',
)

const look = computed(() => (data.value ? LOOKS[data.value.verdict] : null))
const cardStyle = computed(() => ({
  '--dms-status-tint': look.value?.tint,
  '--dms-status-line': look.value?.line,
  background:
    'radial-gradient(420px 180px at 0% 50%, var(--dms-status-tint), transparent 70%), var(--ui-bg)',
}))

const heading = computed(
  () =>
    `${t('api.health.label')} · ${t(stale.value ? 'api.health.state.stale' : isLive.value ? 'api.health.state.live' : 'api.health.state.paused')}`,
)

/** When the verdict on screen began: what "for 8 min" counts from. */
function verdictSince(health: HealthPayload): Date | null {
  if (health.durationMs === null) return null
  const checked = Date.parse(health.checkedAt)
  return Number.isNaN(checked) ? null : new Date(checked - health.durationMs)
}

/**
 * The tooltip of the duration: the moment the duration counts from, the
 * same instant as the text, then when the incident started when it is
 * another one ("Down since 20:48 · the incident started 20:45").
 */
function sinceTitle(health: HealthPayload, since: Date | null): string {
  const start = health.incidentStart
  const parts = since
    ? [
        t(`api.health.since_${health.verdict}`, {
          date: formatFullDateTime(since, dateFormat.value),
        }),
      ]
    : []
  if (
    start &&
    (!since || Math.abs(Date.parse(start) - +since) >= MS_PER_MINUTE)
  )
    parts.push(
      t('api.health.incident_started', {
        date: formatFullDateTime(start, dateFormat.value),
      }),
    )
  return parts.join(' · ')
}

/**
 * Since when: how long the verdict has held (or how long ago the incident
 * ended), the instant it counts from in the tooltip, with the start of the
 * incident; on a healthy API, the last incident.
 */
const incident = computed(() => {
  const health = data.value
  if (!health) return null
  const start = health.incidentStart
  const since = verdictSince(health)
  switch (health.verdict) {
    case 'degraded':
    case 'down':
      return {
        text: heldFor(health),
        datetime: (since?.toISOString() ?? start) || undefined,
        title: sinceTitle(health, since) || undefined,
      }
    case 'recovered':
      return {
        text:
          health.durationMs === null
            ? heldFor(health)
            : t('api.health.recovered_ago', {
                duration: duration(health.durationMs),
              }),
        datetime: (since?.toISOString() ?? start) || undefined,
        title: sinceTitle(health, since) || undefined,
      }
    case 'operational':
      return start
        ? {
            text: t('api.health.last_incident', {
              date: formatRelativeDay(start, dateFormat.value),
            }),
            datetime: start,
            title: formatFullDateTime(start, dateFormat.value),
          }
        : null
    default:
      return null
  }
})

// The tooltip of the duration waits for the browser: it writes a weekday,
// which the server's ICU may punctuate otherwise.
const incidentTitle = useClientValue(() => incident.value?.title)

// One time only: once stale, the banner says when the figures date from.
const checked = computed(() =>
  data.value && !stale.value
    ? t('api.health.checked', {
        time: formatClock(data.value.checkedAt, dateFormat.value),
      })
    : '',
)

const slowThreshold = computed(() =>
  data.value
    ? formatThreshold(data.value.thresholds.slowThresholdMs, locale.value)
    : '',
)

/**
 * The 5xx figure: over the down rule's window when the API is Down, the
 * rate that verdict rests on, else over the degraded rule's; under it, both
 * rules and their windows.
 */
function serverMetric(health: HealthPayload): HeroMetric {
  const { thresholds } = health
  const down = health.verdict === 'down' ? health.ruleWindows?.down : null
  const value = down ? down.serverErrorRate : health.metrics.serverErrorRate
  return {
    id: 'server',
    label: t('api.health.metrics.server_errors', {
      minutes: down ? down.minutes : thresholds.windowMinutes,
    }),
    value: rate(value),
    sub: t('api.health.metrics.server_errors_rules', {
      degraded: rate(thresholds.degradedServerErrorRate),
      minutes: thresholds.windowMinutes,
      down: rate(thresholds.downServerErrorRate),
      downMinutes: thresholds.downWindowMinutes,
    }),
    tone: down
      ? 'error'
      : value >= thresholds.degradedServerErrorRate
        ? 'warning'
        : 'default',
  }
}

// The 5xx rate and the p95 lead: they depend on the server. The 4xx rate,
// often business refusals, stays a grey figure of context.
const metrics = computed<HeroMetric[]>(() => {
  const health = data.value
  if (!health) return []
  const { metrics: figures, thresholds } = health
  const minutes = thresholds.windowMinutes
  return [
    serverMetric(health),
    {
      id: 'p95',
      label: t('api.health.metrics.p95', { minutes }),
      value:
        figures.p95Ms === null ? '—' : formatMs(figures.p95Ms, locale.value),
      sub: t('api.health.metrics.p95_sub', { threshold: slowThreshold.value }),
      tone:
        figures.p95Ms !== null && figures.p95Ms >= thresholds.slowThresholdMs
          ? 'warning'
          : 'default',
    },
    {
      id: 'traffic',
      label: t('api.health.metrics.traffic', { minutes }),
      value: formatDecimal(figures.requestsPerMinute, locale.value),
      unit: t('api.health.metrics.per_minute'),
      sub: t(
        'api.health.metrics.traffic_sub',
        { count: count(health.routes.value) },
        health.routes.value,
      ),
      tone: 'default',
    },
    {
      id: 'client',
      label: t('api.health.metrics.client_errors', { minutes }),
      value: rate(figures.clientErrorRate),
      sub: t('api.health.metrics.client_errors_sub'),
      tone: 'muted',
      secondary: true,
    },
  ]
})
</script>

<template>
  <section
    class="flex flex-col gap-3"
    :aria-busy="pending"
    :aria-label="t('api.health.label')"
  >
    <DmsCard v-if="pending && !data" :padded="false" class="px-6 py-6">
      <div class="flex items-center gap-6">
        <USkeleton class="size-16 rounded-full" />
        <div class="flex flex-col gap-2">
          <USkeleton class="h-3 w-28" />
          <USkeleton class="h-7 w-40" />
          <USkeleton class="h-3 w-52" />
        </div>
        <div class="ml-auto hidden flex-1 grid-cols-4 gap-6 lg:grid">
          <div v-for="index in 4" :key="index" class="flex flex-col gap-2">
            <USkeleton class="h-2.5 w-20" />
            <USkeleton class="h-6 w-16" />
          </div>
        </div>
      </div>
    </DmsCard>

    <DmsCard v-else-if="!data">
      <DmsEmptyState
        variant="error"
        :title="t('api.health.error_title')"
        :description="t('api.health.error_description')"
        :actions="[
          {
            label: t('api.common.retry'),
            icon: 'i-ph-arrow-clockwise',
            onClick: () => refresh(),
          },
        ]"
      />
    </DmsCard>

    <DmsCard v-else-if="data.firstRun" :padded="false" class="px-6 py-7">
      <DmsEmptyState
        size="lg"
        icon="i-ph-broadcast"
        tone="primary"
        :title="t('api.health.first_run.title')"
        :description="
          t('api.health.first_run.description', { count: data.routes.value })
        "
        :actions="[
          {
            label: t('api.health.first_run.browse'),
            icon: 'i-ph-tree-structure',
            to: '/modules/api/routes',
          },
          {
            label: t('api.health.first_run.logs'),
            icon: 'i-ph-list-magnifying-glass',
            color: 'neutral',
            variant: 'outline',
            to: '/modules/api/logs',
          },
        ]"
      />
      <ol
        class="text-muted mx-auto mt-6 grid max-w-3xl gap-3 text-sm sm:grid-cols-3"
      >
        <li
          v-for="step in 3"
          :key="step"
          class="border-default rounded-md border px-3 py-2.5"
        >
          <p class="text-highlighted font-medium">
            <span class="text-primary mr-1 font-mono">{{ step }}</span>
            {{ t(`api.health.first_run.step_${step}`) }}
          </p>
          <p class="text-dimmed mt-0.5 text-xs">
            {{ t(`api.health.first_run.step_${step}_detail`) }}
          </p>
        </li>
      </ol>
    </DmsCard>

    <template v-else>
      <!-- The DMS status hero, drawn here: its "since" line takes a tooltip
           and the 4xx figure stays grey, which DmsStatusSummary cannot do. -->
      <DmsCard
        :padded="false"
        class="px-4 py-[22px] sm:px-[26px]"
        :style="cardStyle"
      >
        <div
          class="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-7"
        >
          <div class="flex shrink-0 items-center gap-4">
            <div
              :class="RING_TEXT[data.verdict]"
              class="border-(--dms-status-line) bg-(--dms-status-tint) relative grid size-16 shrink-0 place-items-center rounded-full border-[1.5px] shadow-[0_0_0_6px_color-mix(in_srgb,var(--dms-status-tint)_50%,transparent)]"
            >
              <UIcon
                :name="LOOKS[data.verdict].icon"
                class="size-[30px]"
                aria-hidden="true"
              />
              <span
                class="ring-(--ui-bg) absolute right-[3px] top-[3px] size-[11px] rounded-full shadow-[0_0_12px_currentColor] ring-[2.5px]"
                :class="LOOKS[data.verdict].dot"
                aria-hidden="true"
              >
                <span
                  v-if="!stale"
                  class="absolute inset-0 animate-ping rounded-full [animation-duration:1.8s] motion-reduce:hidden"
                  :class="LOOKS[data.verdict].dot"
                />
              </span>
            </div>
            <div>
              <DmsEyebrow as="h2" :label="heading" />
              <p
                :class="LOOKS[data.verdict].text"
                class="mt-1.5 text-[28px] font-[650] leading-none tracking-[-0.035em]"
              >
                {{ t(`api.health.verdict.${data.verdict}`) }}
              </p>
              <p
                v-if="incident || checked"
                class="text-dimmed mt-1.5 font-mono text-[11.5px]"
              >
                <time
                  v-if="incident"
                  :datetime="incident.datetime"
                  :title="incidentTitle"
                >
                  {{ incident.text }}
                </time>
                <template v-if="incident && checked">·</template>
                <span v-if="checked">{{ checked }}</span>
              </p>
            </div>
          </div>

          <div class="border-default hidden self-stretch border-l sm:block" />

          <dl
            class="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-[repeat(auto-fit,minmax(96px,1fr))] lg:grid-cols-4"
          >
            <div
              v-for="(metric, index) in metrics"
              :key="metric.id"
              class="min-w-0"
              :class="
                index > 0 && 'sm:border-muted sm:-ml-6 sm:border-l sm:pl-6'
              "
            >
              <dt
                class="text-dimmed font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
              >
                {{ metric.label }}
              </dt>
              <dd
                :class="[
                  METRIC_TONE[metric.tone],
                  metric.secondary ? 'text-base' : 'text-xl',
                ]"
                class="mt-[7px] whitespace-nowrap font-mono font-semibold tabular-nums leading-[1.1] tracking-[-0.03em]"
              >
                {{ metric.value }}
                <span
                  v-if="metric.unit"
                  class="text-dimmed ml-0.5 font-sans text-xs font-medium tracking-normal"
                >
                  {{ metric.unit }}
                </span>
              </dd>
              <dd class="text-dimmed mt-1 text-[11.5px]">
                {{ metric.sub }}
              </dd>
            </div>
          </dl>
        </div>
      </DmsCard>

      <div class="flex flex-wrap items-center gap-2">
        <DmsStatusPill
          v-if="data.failingRoutes > 0"
          tone="error"
          icon="i-ph-x-circle"
          :mono="false"
          :label="
            t(
              'api.health.reasons.failing',
              { count: data.failingRoutes },
              data.failingRoutes,
            )
          "
        />
        <DmsStatusPill
          v-if="data.slowRoutes > 0"
          tone="warning"
          icon="i-ph-timer"
          :mono="false"
          :label="
            t(
              'api.health.reasons.slow',
              { count: data.slowRoutes, threshold: slowThreshold },
              data.slowRoutes,
            )
          "
        />
        <DmsStatusPill
          v-if="data.recoveredRoutes > 0"
          tone="success"
          icon="i-ph-arrow-counter-clockwise"
          :mono="false"
          :label="
            t(
              'api.health.reasons.recovered',
              { count: data.recoveredRoutes },
              data.recoveredRoutes,
            )
          "
        />
        <span
          v-if="
            data.failingRoutes === 0 &&
            data.slowRoutes === 0 &&
            data.recoveredRoutes === 0 &&
            data.verdict !== 'idle'
          "
          class="text-muted text-sm"
        >
          {{
            t('api.health.reasons.none', {
              minutes: data.thresholds.windowMinutes,
            })
          }}
        </span>
        <span class="grow" />
        <UButton
          v-if="data.serverErrors > 0"
          :to="data.serverErrorsLink"
          color="error"
          variant="soft"
          size="sm"
          icon="i-ph-list-magnifying-glass"
          :label="
            t(
              'api.health.view_errors',
              { count: count(data.serverErrors) },
              data.serverErrors,
            )
          "
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-ph-arrow-clockwise"
          :label="t('api.common.refresh')"
          @click="refreshPage"
        />
      </div>
      <DmsBanner
        v-if="stale"
        tone="warning"
        size="sm"
        icon="i-ph-cloud-warning"
        :title="t('api.health.stale_title', { time: staleSince })"
        :description="t('api.health.stale_description')"
      >
        <template #actions>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :label="t('api.common.retry')"
            @click="refresh()"
          />
        </template>
      </DmsBanner>
    </template>
  </section>
</template>
