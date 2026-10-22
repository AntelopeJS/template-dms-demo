<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useDmsRoute, useDmsRouter, useI18n } from '#dms/frontend-module'
import {
  MARKETING_CONTEXT_KEY,
  type ContextWebsite,
} from '../composables/useMarketingContext'
import { useMarketingApi } from '../composables/useMarketingApi'
import { useMarketingContextRead } from '../composables/useMarketingReads'
import { useMarketingNow } from '../composables/useMarketingNow'
import { installLink } from '../composables/useMarketingRoutes'
import { formatRelativeTime, initials, utcDayStart } from '../utils/format'
import { MAX_PERIOD_DAYS, MS_PER_DAY, PERIOD_SCOPE } from '../constants'

/**
 * The context bar of every analytics page and the gate in front of its blocks.
 *
 * The page URL is the context: a reload, a copied link or Back opens on what
 * it names, and each tab keeps its own. The period is the DMS
 * `PeriodSelector` in the bar, publishing under `periodScope`, the scope every
 * block of the page binds to: it keeps the period in the URL
 * (`?<scope>.period=…&<scope>.compare=…`, `<scope>.from`/`.to` for a custom
 * range) and the user's last choice. The website is this bar's own
 * (`?website=`): the blocks read it through a `{{query.website}}` token, so a
 * switch reads them again.
 *
 * What the URL leaves out comes from the reader's last explicit pick: the
 * selector's remembered period and the website saved server-side. Only a pick
 * in the bar writes the website, so opening a link never moves another tab.
 *
 * Its children render once the URL names one of the tenant's websites; with
 * no website at all the first-run hero takes their place, and with
 * `waitingGuide` a website still waiting for its first event shows the way
 * to its install guide instead. A server render reads the context first: a
 * URL naming no website (or one the tenant does not have) is redirected to
 * the one saved, and the page renders on it.
 */
const props = withDefaults(
  defineProps<{
    periodScope?: string
    waitingGuide?: boolean
    componentId?: string
    pageId?: string
  }>(),
  {
    periodScope: PERIOD_SCOPE,
    waitingGuide: false,
    componentId: undefined,
    pageId: undefined,
  },
)

const PRESETS = [
  'today',
  'last-7-days',
  'last-30-days',
  'last-90-days',
  'custom',
]
const COMPARISONS = ['previous-period', 'previous-year', 'none']
const CLOCK_TICK_MS = 15_000
/**
 * How often the blocks of a period reaching today and the websites' last
 * events are read again (the pages' `live` option caps the blocks alike).
 */
const LIVE_REFRESH_MS = 60_000
/** A website is live while its last event is this recent. */
const LIVE_WINDOW_MS = 30 * 60 * 1000

const { t, locale } = useI18n()
const api = useMarketingApi()
const toast = useToast()
const route = useDmsRoute()
const router = useDmsRouter()

const presetLabels = computed(() =>
  Object.fromEntries(
    PRESETS.map((preset) => [
      preset,
      t(`page.marketing.context.presets.${preset}`),
    ]),
  ),
)

const comparisonLabels = computed(() =>
  Object.fromEntries(
    COMPARISONS.map((comparison) => [
      comparison,
      t(`page.marketing.context.comparisons.${comparison}`),
    ]),
  ),
)

// The minute's activity of every website: read on the bar's own clock.
const contextRead = useMarketingContextRead({
  refreshInterval: LIVE_REFRESH_MS,
})
const context = contextRead.data
/**
 * The context could not be read, and none is shown: a failed re-read (the
 * minute's activity, a retry) keeps the bar as it is.
 */
const failed = computed(
  () =>
    !!contextRead.error.value &&
    contextRead.status.value !== 'pending' &&
    !context.value,
)
const switching = ref(false)

const websites = computed(() => context.value?.websites ?? [])
/** The URL's website, while it is one of the tenant's. */
const linkedId = computed(() => {
  const id = route.query.website
  return typeof id === 'string' && websites.value.some((site) => site.id === id)
    ? id
    : null
})
const selectedId = computed(
  () => linkedId.value ?? context.value?.selectedId ?? null,
)
const selected = computed<ContextWebsite | null>(
  () => websites.value.find((site) => site.id === selectedId.value) ?? null,
)

/** The websites and their last events again; a failure keeps the bar as is. */
const reload = (): Promise<void> => contextRead.refresh()

async function select(id: string): Promise<void> {
  if (id === selectedId.value) {
    return
  }
  switching.value = true
  try {
    // Saved first, as the website of the pages opened without one; the bar
    // and the blocks follow the URL once it names it. A pick is a history
    // entry, so Back takes it back.
    context.value = await api.selectContextWebsite(id)
    await router.push({ query: { ...route.query, website: id } })
  } catch {
    toast.add({
      color: 'error',
      title: t('page.marketing.context.switch_error'),
    })
    await reload()
  } finally {
    switching.value = false
  }
}

// The URL names no website, or one the tenant does not have: fill in the
// saved one, without a history entry (a server render redirects to it).
// Watched with the query too, so a block rewriting the URL for its own state
// (the heatmap path) keeps it. Set up once the context is read.
await contextRead
watch(
  [selectedId, () => route.query],
  ([id]) => {
    if (id && route.query.website !== id) {
      void router.replace({ query: { ...route.query, website: id } })
    }
  },
  { immediate: true },
)

// --- Period --------------------------------------------------------------------

const period = usePeriodScope(props.periodScope)

// Read once the bar shows the selector: the scope registers with it, and a
// read before has the DMS warn about a missing scope.
const range = computed(() => (selected.value ? period.value?.range : null))

/** A custom range longer than the routes read: only its last days are shown. */
const cutHint = computed(() => {
  if (!range.value) {
    return ''
  }
  const { from, to } = range.value
  const days = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
  return days > MAX_PERIOD_DAYS
    ? t('page.marketing.context.range_cut', { days: MAX_PERIOD_DAYS })
    : ''
})

provide(MARKETING_CONTEXT_KEY, {
  websites,
  selected,
  select,
  reload,
})

// --- Clock -------------------------------------------------------------------
// A period reaching today follows the clock: its blocks read again every
// minute, through the page's live gate. The selector itself moves a day
// preset on at midnight.

const now = useMarketingNow(CLOCK_TICK_MS)

/** The period covers the present: its counts are still moving. */
const reachesToday = computed(
  () => !!range.value && range.value.to.getTime() >= now.value,
)

/** Refresh: every block reads again, and the bar. */
function refresh(): void {
  refreshPageBlocks()
  void reload()
}

/** A period reaching today: its blocks read again, through the live gate. */
function liveRefresh(): void {
  if (reachesToday.value && linkedId.value) {
    refreshLivePageBlocks()
  }
}

let live: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  live = setInterval(liveRefresh, LIVE_REFRESH_MS)
})
onBeforeUnmount(() => {
  if (live) {
    clearInterval(live)
  }
})

// --- Bar ---------------------------------------------------------------------

/** `live` only while events are recent; a quiet site is `idle`. */
type DisplayState = ContextWebsite['state'] | 'idle'

const STATE_TONES: Record<DisplayState, string> = {
  live: 'bg-success',
  idle: 'bg-(--ui-text-muted)',
  imported: 'bg-info',
  waiting: 'bg-warning',
  paused: 'bg-(--ui-text-dimmed)',
}

function displayState(site: ContextWebsite): DisplayState {
  if (
    site.state === 'live' &&
    (site.lastActivityAt === null ||
      now.value - site.lastActivityAt > LIVE_WINDOW_MS)
  ) {
    return 'idle'
  }
  return site.state
}

function stateLine(site: ContextWebsite): string {
  const state = displayState(site)
  if (
    (state === 'live' || state === 'idle' || state === 'imported') &&
    site.lastActivityAt
  ) {
    return t(`page.marketing.context.${state}`, {
      ago: formatRelativeTime(site.lastActivityAt, now.value, locale.value),
    })
  }
  return t(`page.marketing.context.state.${site.state}`)
}

const websiteItems = computed(() => [
  websites.value.map((site) => ({
    label: site.name,
    description: site.domain,
    type: 'checkbox' as const,
    checked: site.id === selectedId.value,
    slot: 'website' as const,
    site,
    onSelect: () => void select(site.id),
  })),
  [
    {
      label: t('page.marketing.context.add_website'),
      icon: 'i-ph-plus',
      to: installLink(),
    },
  ],
])

/**
 * The statistics are kept per UTC day: where the reader's midnight is not
 * UTC's, the bar says when their days really start.
 */
const utcHint = computed(() => {
  // The reader's zone: the browser's, which a server render reads from its
  // cookie.
  const time = utcDayStart(now.value, locale.value, readerTimeZone())
  return time ? t('page.marketing.context.utc_days', { time }) : ''
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      class="dms-card flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2"
      role="toolbar"
      :aria-label="t('page.marketing.context.label')"
    >
      <USkeleton v-if="!context && !failed" class="h-7 w-72" />
      <template v-else-if="selected">
        <UDropdownMenu :items="websiteItems" :content="{ align: 'start' }">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            trailing-icon="i-ph-caret-up-down"
            :loading="switching"
            :aria-label="t('page.marketing.context.switch_website')"
          >
            <span
              class="grid size-5 place-items-center rounded bg-primary/15 font-mono text-[10px] font-semibold text-(--ui-color-primary-800) dark:text-primary"
            >
              {{ initials(selected.name) }}
            </span>
            <span class="font-semibold">{{ selected.name }}</span>
          </UButton>
          <template #website="{ item }">
            <span
              class="grid size-6 shrink-0 place-items-center rounded bg-primary/15 font-mono text-[10px] font-semibold text-(--ui-color-primary-800) dark:text-primary"
            >
              {{ initials(item.site.name) }}
            </span>
            <span class="min-w-0 flex-1 text-left">
              <span class="block truncate text-sm font-medium text-highlighted">
                {{ item.site.name }}
              </span>
              <span
                class="flex min-w-0 items-center gap-1.5 text-xs text-dimmed"
              >
                <span
                  class="size-1.5 shrink-0 rounded-full"
                  :class="STATE_TONES[displayState(item.site)]"
                  aria-hidden="true"
                />
                <span class="truncate font-mono">{{ item.site.domain }}</span>
                <span class="shrink-0">· {{ stateLine(item.site) }}</span>
              </span>
            </span>
            <UIcon
              v-if="item.checked"
              name="i-ph-check"
              class="size-4 shrink-0 text-primary"
            />
          </template>
        </UDropdownMenu>

        <span class="flex items-center gap-2 font-mono text-xs text-muted">
          <span
            class="size-2 rounded-full"
            :class="STATE_TONES[displayState(selected)]"
            aria-hidden="true"
          />
          {{ stateLine(selected) }}
        </span>

        <span class="hidden h-5 w-px bg-(--ui-border) md:block" />

        <div class="flex flex-wrap items-center gap-2">
          <DmsPeriodSelector
            :id="periodScope"
            :component-id="`${componentId ?? 'marketing-context'}-period`"
            :page-id="pageId"
            variant="segmented"
            size="xs"
            align="left"
            default-preset="last-30-days"
            default-comparison="previous-period"
            :presets="PRESETS"
            :comparisons="COMPARISONS"
            :preset-labels="presetLabels"
            :comparison-labels="comparisonLabels"
            show-range-label
          />
          <span
            v-if="cutHint"
            class="flex items-center gap-1 text-xs text-warning"
            role="status"
          >
            <UIcon name="i-ph-warning" class="size-3.5 shrink-0" />
            {{ cutHint }}
          </span>
          <UTooltip v-if="utcHint" :text="utcHint">
            <span
              class="cursor-help rounded border border-default px-1 font-mono text-[10px] text-dimmed"
              tabindex="0"
              :aria-label="utcHint"
            >
              UTC
            </span>
          </UTooltip>
        </div>

        <UButton
          class="ms-auto"
          icon="i-ph-arrow-clockwise"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('page.marketing.context.refresh')"
          @click="refresh"
        />
      </template>
      <span v-else-if="!failed" class="text-sm text-muted">
        {{ t('page.marketing.context.no_website') }}
      </span>
    </div>

    <DmsEmptyState
      v-if="failed"
      variant="error"
      :title="t('page.marketing.context.error.title')"
      :description="t('page.marketing.context.error.description')"
      class="dms-card"
    >
      <template #actions>
        <UButton
          icon="i-ph-arrow-clockwise"
          color="neutral"
          variant="outline"
          size="sm"
          :label="t('page.marketing.common.retry')"
          @click="reload"
        />
      </template>
    </DmsEmptyState>

    <DmsMarketingFirstRun v-else-if="context && websites.length === 0" />

    <DmsEmptyState
      v-else-if="waitingGuide && linkedId && selected?.state === 'waiting'"
      icon="i-ph-plugs"
      :title="
        t('page.marketing.context.waiting_guide.title', { name: selected.name })
      "
      :description="t('page.marketing.context.waiting_guide.description')"
      class="dms-card"
    >
      <template #actions>
        <UButton
          icon="i-ph-book-open-text"
          size="sm"
          :label="t('page.marketing.context.waiting_guide.action')"
          @click="router.push(installLink(selected.id))"
        />
      </template>
    </DmsEmptyState>

    <slot v-else-if="linkedId" />

    <div v-else class="grid gap-4 md:grid-cols-4">
      <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-xl" />
      <USkeleton class="h-72 rounded-xl md:col-span-4" />
    </div>
  </div>
</template>
