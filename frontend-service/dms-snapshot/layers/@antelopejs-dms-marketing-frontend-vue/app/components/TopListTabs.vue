<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#dms/frontend-module'
import { useContextLink } from '../composables/useContextLink'
import { displayName, formatNumber, percentChangeTrend } from '../utils/format'
import { fractionDigits } from '../constants'

/**
 * One overview card holding sibling top lists behind tabs (top pages, entry,
 * exit…), read in one request that follows the period scope. Each row shows
 * its rank, a bar of its share, the count, the share and, with a comparison,
 * its change; rows lead to the surface that owns them, in the page's website
 * and period.
 */
type LabelKind = 'raw' | 'channel' | 'country' | 'language' | 'device'

interface TopRow {
  id: string
  title: string
  value: number
  share: number
  /** Percent change; null without a value to compare, absent without a comparison. */
  delta?: number | null
  to?: string
  tag?: string
}

interface TopTab {
  id: string
  label: string
  labelKind: LabelKind
  total: number
  items: TopRow[]
}

interface TopTabsResponse {
  tabs: TopTab[]
}

const props = withDefaults(
  defineProps<{
    fetchUrl: string
    periodScope?: string
    eyebrow: string
    valueLabel: string
    note?: string
    footerLabel?: string
    footerTo?: string
    componentId?: string
    pageId?: string
  }>(),
  {
    periodScope: undefined,
    note: undefined,
    footerLabel: undefined,
    footerTo: undefined,
    componentId: undefined,
    pageId: undefined,
  },
)

const HIGHLIGHTED_RANKS = 3
const SKELETON_ROWS = 6
const RANK_DIGITS = 2

const { t, te, locale } = useI18n()
const { processI18n } = useTranslation()
const inContext = useContextLink()

const { data, isLoading, error, refresh } = useChartFetch<TopTabsResponse>({
  fetchUrl: props.fetchUrl,
  periodScope: props.periodScope,
})

const tabs = computed(() => data.value?.tabs ?? [])
const activeId = ref<string>('')

watch(
  tabs,
  (list) => {
    if (!list.some((tab) => tab.id === activeId.value)) {
      activeId.value = list[0]?.id ?? ''
    }
  },
  { immediate: true },
)

const active = computed(
  () => tabs.value.find((tab) => tab.id === activeId.value) ?? null,
)
const maxShare = computed(() =>
  Math.max(1, ...(active.value?.items.map((item) => item.share) ?? [])),
)
/** The period is compared with another: each row says how it moved. */
const compared = computed(
  () => active.value?.items.some((item) => item.delta !== undefined) ?? false,
)

const LABELERS: Record<LabelKind, (key: string) => string> = {
  raw: (key) => key,
  channel: (key) => {
    const i18nKey = `page.marketing.channels.${key}`
    return te(i18nKey) ? t(i18nKey) : key
  },
  country: (key) => displayName(key, 'region', locale.value),
  language: (key) => displayName(key, 'language', locale.value),
  device: (key) => t(`page.marketing.devices.${key}`),
}

const MONO_KINDS = new Set<LabelKind>(['raw'])

const DELTA_SIGNS = { up: '+', down: '−', flat: '±' } as const
const DELTA_TONES = {
  up: 'text-success',
  down: 'text-error',
  flat: 'text-dimmed',
} as const

function rank(index: number): string {
  return String(index + 1).padStart(RANK_DIGITS, '0')
}

function deltaLabel(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) {
    return '—'
  }
  return `${DELTA_SIGNS[percentChangeTrend(delta)]}${formatPercentage(Math.abs(delta) / 100, locale.value, fractionDigits(0))}`
}

function deltaClass(delta: number | null | undefined): string {
  return delta === null || delta === undefined
    ? 'text-dimmed'
    : DELTA_TONES[percentChangeTrend(delta)]
}

// --- Tabs --------------------------------------------------------------------

const tabItems = computed(() =>
  tabs.value.map((tab) => ({ label: processI18n(tab.label), value: tab.id })),
)

/**
 * The card's own look over the stock tabs: no list border (the header draws
 * it), and a short bar under the active tab instead of the sliding indicator.
 */
const TABS_UI = {
  root: 'gap-0',
  list: 'gap-1 overflow-x-auto border-b-0 p-0 mb-0 [scrollbar-width:none]',
  indicator: 'hidden',
  trigger:
    'shrink-0 rounded-sm px-2 py-3 text-[13px] font-normal whitespace-nowrap data-[state=active]:font-semibold data-[state=active]:text-highlighted hover:data-[state=inactive]:not-disabled:text-highlighted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-primary',
}
</script>

<template>
  <section class="dms-card flex min-w-0 flex-col overflow-hidden p-0">
    <header
      class="flex flex-wrap items-center gap-x-4 border-b border-default px-4"
    >
      <DmsEyebrow :label="processI18n(eyebrow)" class="shrink-0 py-3" />
      <!-- UTabs cannot name its tablist: the group around it carries the name. -->
      <div
        v-if="tabs.length > 1"
        role="group"
        :aria-label="processI18n(eyebrow)"
        class="order-last -mx-1 min-w-0 basis-full sm:order-none sm:mx-0 sm:flex-1 sm:basis-auto"
      >
        <UTabs
          v-model="activeId"
          :items="tabItems"
          :content="false"
          variant="link"
          :ui="TABS_UI"
          class="w-full"
        />
      </div>
      <DmsEyebrow
        :label="processI18n(valueLabel)"
        class="ms-auto shrink-0 py-3"
      />
    </header>

    <div
      class="flex-1"
      :role="tabs.length > 1 ? 'tabpanel' : undefined"
      :aria-label="
        tabs.length > 1 && active ? processI18n(active.label) : undefined
      "
    >
      <DmsEmptyState
        v-if="error && !data"
        variant="error"
        size="sm"
        :title="t('page.marketing.common.load_error')"
      >
        <template #actions>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-ph-arrow-clockwise"
            :label="t('page.marketing.common.retry')"
            @click="refresh"
          />
        </template>
      </DmsEmptyState>
      <ul
        v-else-if="isLoading && !data"
        class="divide-y divide-default"
        aria-hidden="true"
      >
        <li
          v-for="index in SKELETON_ROWS"
          :key="index"
          class="flex items-center gap-3 px-4 py-3"
        >
          <USkeleton class="h-3 w-5" />
          <USkeleton class="h-3 flex-1" />
          <USkeleton class="h-3 w-12" />
        </li>
      </ul>
      <p
        v-else-if="!active || active.items.length === 0"
        class="px-4 py-10 text-center text-sm text-muted"
      >
        {{ t('page.marketing.overview.groups.empty') }}
      </p>
      <ol
        v-else
        class="divide-y divide-default transition-opacity"
        :class="isLoading ? 'opacity-60' : ''"
      >
        <li v-for="(item, index) in active.items" :key="item.id">
          <component
            :is="item.to ? 'DmsAutoLink' : 'div'"
            :to="item.to ? inContext(item.to) : undefined"
            class="grid items-center gap-x-3 px-4 py-2"
            :class="[
              compared
                ? 'grid-cols-[1.5rem_minmax(0,1fr)_auto_3rem_3rem]'
                : 'grid-cols-[1.5rem_minmax(0,1fr)_auto_3rem]',
              item.to ? 'transition-colors hover:bg-elevated/60' : '',
            ]"
          >
            <span
              class="font-mono text-[11px]"
              :class="
                index < HIGHLIGHTED_RANKS
                  ? 'font-semibold text-primary'
                  : 'text-dimmed'
              "
            >
              {{ rank(index) }}
            </span>
            <span class="min-w-0">
              <span class="flex min-w-0 items-center gap-2">
                <span
                  class="truncate text-[13px] text-highlighted"
                  :class="MONO_KINDS.has(active.labelKind) ? 'font-mono' : ''"
                  :title="LABELERS[active.labelKind](item.title)"
                >
                  {{ LABELERS[active.labelKind](item.title) }}
                </span>
                <DmsStatusPill
                  v-if="item.tag"
                  tone="primary"
                  size="sm"
                  :mono="false"
                  icon="i-ph-flag-checkered"
                  :label="processI18n(item.tag)"
                />
              </span>
              <span
                class="mt-1 block h-0.5 rounded-full bg-primary/70"
                :style="{ width: `${(item.share / maxShare) * 100}%` }"
              />
            </span>
            <span class="font-mono text-[13px] text-highlighted tabular-nums">
              {{ formatNumber(item.value, locale) }}
            </span>
            <span
              class="text-right font-mono text-[11px] text-dimmed tabular-nums"
            >
              {{
                formatPercentage(item.share / 100, locale, fractionDigits(1))
              }}
            </span>
            <span
              v-if="compared"
              class="text-right font-mono text-[11px] tabular-nums"
              :class="deltaClass(item.delta)"
            >
              {{ deltaLabel(item.delta) }}
            </span>
          </component>
        </li>
      </ol>
    </div>

    <footer
      v-if="footerTo || note"
      class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-default px-4 py-2.5 text-xs"
    >
      <DmsAutoLink
        v-if="footerTo && footerLabel"
        :to="inContext(footerTo)"
        class="inline-flex items-center gap-1 font-medium whitespace-nowrap text-primary hover:underline"
      >
        {{ processI18n(footerLabel) }}
        <UIcon name="i-ph-arrow-right" class="size-3.5" />
      </DmsAutoLink>
      <span v-if="note" class="min-w-0 text-dimmed">
        {{ processI18n(note) }}
      </span>
    </footer>
  </section>
</template>
