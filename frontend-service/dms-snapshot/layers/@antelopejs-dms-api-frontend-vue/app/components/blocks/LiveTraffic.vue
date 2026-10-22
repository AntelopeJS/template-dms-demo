<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { formatClock, formatCount } from '../../utils/format'
import { bodyLimit } from '../../utils/logsQuery'
import {
  axisTicks,
  liveStatus,
  minuteBars,
  peakBar,
  type MinuteBucket,
} from '../../utils/minuteHistogram'

// The shape of the last hour above the request table: requests per minute by
// status class, for all traffic whatever the table's filters. It follows the
// page's Direct / Pause state (`usePageLive`): read again on the live feed and
// every minute in Direct, still while paused, and it says which. A read that fails says so
// at once, with the time of the data still shown; the next refresh retries.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  fetchUrl: string
  /** The live feed (`LIVE_REQUESTS_TOPIC`): the graph is read again on it. */
  realtimeTopic?: string
  /** The body size limit of the capture, in bytes (0: bodies not kept). */
  maxBodyBytes?: number
  pageId?: string
  componentId?: string
}>()

interface LivePayload {
  buckets: MinuteBucket[]
  total: number
  clientErrors: number
  serverErrors: number
  refreshedAt: string
  retentionDays: number
}

const { t } = useI18n()
const { formatLocale: locale, formatNumber } = useRegionalFormat({
  locale: 'format',
})
const dateFormat = useDateFormat()
const { data, error, pending, refresh } = useApiData<LivePayload>(
  () => props.fetchUrl,
  { refreshOnPageRefresh: false },
)

// The paused state is the browser's (the DMS remembers it per page), the
// server renders Direct: the card says it is paused once mounted, so the
// hydration finds the markup the server sent.
const live = usePageLive()
const mounted = ref(false)
onMounted(() => (mounted.value = true))
const isLive = computed(() => !mounted.value || live.isLive.value)
const failures = ref(0)

async function poll() {
  await refresh()
  failures.value = error.value ? failures.value + 1 : 0
}

// The current minute moves without traffic too: read again after a quiet
// minute.
usePageLiveRefresh(() => void poll(), {
  realtimeTopic: props.realtimeTopic,
  idleRefresh: 60,
})

// A first load that failed counts as a failed poll: the graph says it is
// reconnecting at once, not after the next poll.
watch(pending, (loading) => {
  if (!loading && error.value && failures.value === 0) failures.value = 1
})

const status = computed(() => liveStatus(isLive.value, failures.value))

const count = (value: number) => formatCount(value, locale.value)
const MINUTE: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
}
const minute = (start: number) => dateFormat.value(MINUTE).format(start)

const kept = computed(() => {
  if (!data.value) return ''
  const days = data.value.retentionDays
  if (props.maxBodyBytes === undefined) return t('api.live.kept_days', { days })
  const limit = bodyLimit(props.maxBodyBytes)
  if (limit.unit === 'none') return t('api.live.kept_no_bodies', { days })
  return t('api.live.kept', {
    days,
    size: t(`api.live.size_${limit.unit}`, {
      amount: formatNumber(limit.amount),
    }),
  })
})

const lastData = computed(() =>
  data.value
    ? t('api.live.last_data', {
        time: formatClock(data.value.refreshedAt, dateFormat.value),
      })
    : t('api.live.no_data_yet'),
)

const chart = computed(() =>
  minuteBars(data.value?.buckets ?? [], data.value?.refreshedAt),
)
const ticks = computed(() => axisTicks(chart.value.bars))

// The chart's text alternative: the totals and the busiest minute.
const summary = computed(() => {
  const payload = data.value
  if (!payload || payload.total === 0) return t('api.live.summary_empty')
  const peak = peakBar(chart.value.bars)
  return t('api.live.summary', {
    total: count(payload.total),
    client: count(payload.clientErrors),
    server: count(payload.serverErrors),
    peak: count(peak?.total ?? 0),
    time: peak ? minute(peak.start) : '',
  })
})

const hovered = ref<number | null>(null)
const hoveredBar = computed(() =>
  hovered.value === null ? undefined : chart.value.bars[hovered.value],
)

const tooltip = computed(() => {
  const bar = hoveredBar.value
  if (!bar) return ''
  const parts = [minute(bar.start)]
  if (bar.total === 0) parts.push(t('api.live.tooltip_none'))
  else {
    parts.push(t('api.live.total', { count: count(bar.total) }, bar.total))
    if (bar.clientErrors) parts.push(`4xx ${count(bar.clientErrors)}`)
    if (bar.serverErrors) parts.push(`5xx ${count(bar.serverErrors)}`)
  }
  if (bar.current) parts.push(t('api.live.tooltip_current'))
  return parts.join(' · ')
})

// Kept inside the card: anchored left near the start, right near the end.
const TOOLTIP_EDGE_BARS = 8
const tooltipStyle = computed(() => {
  const index = hovered.value ?? 0
  const length = chart.value.bars.length || 1
  const left = ((index + 0.5) / length) * 100
  const shift =
    index < TOOLTIP_EDGE_BARS
      ? '0%'
      : index >= length - TOOLTIP_EDGE_BARS
        ? '-100%'
        : '-50%'
  return { left: `${left}%`, transform: `translateX(${shift})` }
})

const tickStyle = (index: number) => {
  const length = chart.value.bars.length || 1
  if (index === 0) return { left: '0' }
  if (index === length - 1) return { right: '0' }
  return {
    left: `${((index + 0.5) / length) * 100}%`,
    transform: 'translateX(-50%)',
  }
}

// A segment's share of its bar, the bar being its segments' sum.
const share = (part: number, bar: { heights: Record<string, number> }) => {
  const sum =
    bar.heights.success + bar.heights.clientErrors + bar.heights.serverErrors
  return sum === 0 ? '0%' : `${(part / sum) * 100}%`
}
</script>

<template>
  <DmsCard :padded="false" class="overflow-hidden">
    <template #header>
      <div class="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
        <DmsEyebrow :label="t('api.live.title')" />
        <span class="text-dimmed font-mono text-[11px]">{{ kept }}</span>
        <span class="grow" />
        <span
          v-if="data"
          class="text-muted flex flex-wrap items-center gap-x-2 font-mono text-[11px]"
        >
          <span>
            {{ t('api.live.total', { count: count(data.total) }, data.total) }}
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="bg-(--dms-chart-1) size-2 rounded-[2px]" />
            {{ t('api.live.legend_success') }}
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="bg-warning size-2 rounded-[2px]" />
            4xx {{ count(data.clientErrors) }}
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="bg-error size-2 rounded-[2px]" />
            5xx {{ count(data.serverErrors) }}
          </span>
        </span>
        <span
          role="status"
          class="text-warning flex items-center gap-1.5 font-mono text-[11px]"
        >
          <template v-if="status === 'reconnecting'">
            <UIcon name="i-ph-cloud-warning" class="size-3.5" />
            {{ t('api.live.reconnecting') }} · {{ lastData }}
          </template>
        </span>
        <UButton
          v-if="status === 'reconnecting'"
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-ph-arrow-clockwise"
          :label="t('api.common.retry')"
          @click="poll()"
        />
        <span
          v-if="status === 'live'"
          class="text-success flex items-center gap-1.5 font-mono text-[11px]"
        >
          <span
            class="bg-success size-1.5 rounded-full motion-safe:animate-pulse"
          />
          {{ t('api.live.following') }}
        </span>
        <span
          v-else-if="status === 'paused'"
          class="text-muted flex items-center gap-1.5 font-mono text-[11px]"
        >
          <UIcon name="i-ph-pause-fill" class="size-3" />
          {{ t('api.live.paused') }} · {{ lastData }}
        </span>
      </div>
    </template>

    <div class="px-3 pb-2 pt-1">
      <div v-if="pending && !data" class="flex h-[112px] items-end gap-[2px] px-2">
        <USkeleton
          v-for="index in 60"
          :key="index"
          class="flex-1"
          :style="{ height: `${20 + ((index * 37) % 60)}%` }"
        />
      </div>
      <div v-else-if="data">
        <div class="text-dimmed mb-1 font-mono text-[10px]">
          <template v-if="chart.ceiling">
            {{ t('api.live.scale', { count: count(chart.ceiling) }) }}
            <template v-if="chart.clipped">
              · {{ t('api.live.scale_cut') }}
            </template>
          </template>
        </div>
        <div class="relative" @mouseleave="hovered = null">
          <div
            role="img"
            :aria-label="summary"
            class="flex h-[112px] items-stretch gap-[2px] transition-opacity"
            :class="{ 'opacity-50 grayscale': status === 'reconnecting' }"
          >
            <div
              v-for="(bar, index) in chart.bars"
              :key="bar.start"
              class="relative flex flex-1 flex-col justify-end"
              :class="{ 'dms-api-live-current': bar.current }"
              @mouseenter="hovered = index"
            >
              <div
                v-if="bar.total"
                class="relative flex flex-col-reverse gap-px overflow-hidden rounded-t-[2px]"
                :style="{
                  height: `${
                    bar.heights.success +
                    bar.heights.clientErrors +
                    bar.heights.serverErrors
                  }%`,
                }"
              >
                <span
                  v-if="bar.success"
                  class="bg-(--dms-chart-1) block shrink-0"
                  :style="{ height: share(bar.heights.success, bar) }"
                />
                <span
                  v-if="bar.clientErrors"
                  class="bg-warning block shrink-0"
                  :style="{ height: share(bar.heights.clientErrors, bar) }"
                />
                <span
                  v-if="bar.serverErrors"
                  class="bg-error block shrink-0"
                  :style="{ height: share(bar.heights.serverErrors, bar) }"
                />
                <span
                  v-if="bar.current"
                  class="dms-api-live-hatch absolute inset-0"
                />
              </div>
              <span
                v-if="bar.clipped"
                class="bg-inverted absolute inset-x-0 top-0 h-[2px]"
              />
            </div>
          </div>
          <div
            v-if="hoveredBar"
            class="bg-inverted text-inverted pointer-events-none absolute top-0 z-10 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded px-2 py-1 font-mono text-[11px] shadow-sm"
            :style="tooltipStyle"
          >
            {{ tooltip }}
          </div>
        </div>
        <div class="text-dimmed relative mt-1 h-3.5 font-mono text-[10px]">
          <span
            v-for="index in ticks"
            :key="index"
            class="absolute top-0"
            :style="tickStyle(index)"
          >
            {{ minute(chart.bars[index].start) }}
          </span>
        </div>
      </div>
      <DmsEmptyState
        v-else
        size="sm"
        variant="error"
        :title="t('api.live.error')"
        :description="t('api.live.error_description')"
      />
    </div>
  </DmsCard>
</template>

<style scoped>
/* The minute still running: a hatched track, and its bar hatched over. */
.dms-api-live-current {
  background-image: repeating-linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-border-accented) 60%, transparent) 0 1px,
    transparent 1px 5px
  );
}
.dms-api-live-hatch {
  background-image: repeating-linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-bg) 55%, transparent) 0 2px,
    transparent 2px 5px
  );
}
</style>
