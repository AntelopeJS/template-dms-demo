<script setup lang="ts">
import { computed } from 'vue'
import { useDmsRoute, useDmsRouter, useI18n } from '#dms/frontend-module'
import { channelStyle } from '../utils/channels'
import { formatNumber } from '../utils/format'
import { fractionDigits } from '../constants'

/**
 * The channel split of the period: a stacked share bar, then one row per
 * channel with its sessions, share and change vs the comparison window. A
 * row opens the channel's tab of the campaigns table.
 */
interface ChannelRow {
  id: string
  sessions: number
  share: number
  delta: number | null
}

interface ChannelsResponse {
  total: number
  items: ChannelRow[]
  /** The comparison days lost their channel split: no delta to show. */
  compareUnavailable?: boolean
}

const props = withDefaults(
  defineProps<{
    fetchUrl: string
    periodScope?: string
    componentId?: string
    pageId?: string
  }>(),
  { periodScope: undefined, componentId: undefined, pageId: undefined },
)

const SKELETON_ROWS = 6
/** The key the campaigns table is mounted under on the page: its tab reads `?campaigns.tab=`. */
const CAMPAIGNS_TAB_QUERY = 'campaigns.tab'

const { t, locale } = useI18n()
const route = useDmsRoute()
const router = useDmsRouter()

const { data, isLoading, error, refresh } = useChartFetch<ChannelsResponse>({
  fetchUrl: props.fetchUrl,
  periodScope: props.periodScope,
})

const rows = computed(() => data.value?.items ?? [])
const maxShare = computed(() =>
  Math.max(1, ...rows.value.map((row) => row.share)),
)
const splitLabel = computed(() =>
  t('page.marketing.acquisition.channels.split', {
    shares: rows.value
      .filter((row) => row.sessions > 0)
      .map(
        (row) =>
          `${t(`page.marketing.channels.${row.id}`)} ${formatPercentage(row.share / 100, locale.value, fractionDigits(1))}`,
      )
      .join(', '),
  }),
)

function deltaClass(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 0.05) {
    return 'bg-elevated text-muted'
  }
  return delta > 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
}

function deltaLabel(delta: number | null): string {
  if (delta === null) {
    return '—'
  }
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  return `${sign}${formatPercentage(Math.abs(delta) / 100, locale.value, fractionDigits(1))}`
}

/** The campaigns table, found by its heading: stock blocks carry no id. */
function scrollToCampaigns(): void {
  const title = t('page.marketing.acquisition.campaigns.title')
  const heading = [...document.querySelectorAll('h2')].find((element) =>
    element.textContent?.trim().startsWith(title),
  )
  heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * The campaigns table follows the tab the URL names: the page stays mounted
 * on the new URL, where the tab stays shareable.
 */
function showCampaigns(channel: string): void {
  void router.push(
    { query: { ...route.query, [CAMPAIGNS_TAB_QUERY]: channel } },
    { onSuccess: () => requestAnimationFrame(scrollToCampaigns) },
  )
}
</script>

<template>
  <section class="dms-card flex h-full flex-col overflow-hidden p-0">
    <header class="flex items-center gap-4 border-b border-default px-4 py-3">
      <DmsEyebrow
        :label="
          t(
            'page.marketing.acquisition.channels.title',
            { count: formatNumber(data?.total ?? 0, locale) },
            data?.total ?? 0,
          )
        "
      />
      <div
        v-if="data && data.total > 0"
        class="ms-auto flex h-2 w-56 max-w-[40%] overflow-hidden rounded-full bg-elevated"
        role="img"
        :aria-label="splitLabel"
      >
        <span
          v-for="row in rows"
          :key="row.id"
          class="h-full"
          :class="channelStyle(row.id).bar"
          :style="{ width: `${row.share}%` }"
          :title="`${t(`page.marketing.channels.${row.id}`)} · ${formatPercentage(row.share / 100, locale, fractionDigits(1))}`"
        />
      </div>
    </header>

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

    <DmsEmptyState
      v-else-if="data && data.total === 0 && !isLoading"
      size="sm"
      icon="i-ph-chart-bar-horizontal"
      :title="t('page.marketing.acquisition.channels.empty')"
    />

    <table v-else class="w-full text-sm">
      <thead>
        <tr
          class="text-left font-mono text-[10px] tracking-widest text-dimmed uppercase"
        >
          <th scope="col" class="px-4 py-2 font-normal" colspan="2">
            {{ t('page.marketing.acquisition.channels.channel') }}
          </th>
          <th scope="col" class="px-2 py-2 text-right font-normal">
            {{ t('page.marketing.acquisition.channels.sessions') }}
          </th>
          <th scope="col" class="px-2 py-2 text-right font-normal">
            {{ t('page.marketing.acquisition.channels.share') }}
          </th>
          <th
            scope="col"
            class="px-4 py-2 text-right font-normal"
            :title="t('page.marketing.acquisition.channels.vs_previous_hint')"
          >
            {{ t('page.marketing.acquisition.channels.vs_previous') }}
          </th>
        </tr>
      </thead>
      <tbody v-if="isLoading && !data" aria-hidden="true">
        <tr
          v-for="index in SKELETON_ROWS"
          :key="index"
          class="border-t border-default"
        >
          <td class="px-4 py-3" colspan="5">
            <USkeleton class="h-4 w-full" />
          </td>
        </tr>
      </tbody>
      <tbody v-else :class="isLoading ? 'opacity-60' : ''">
        <tr
          v-for="row in rows"
          :key="row.id"
          class="cursor-pointer border-t border-default hover:bg-elevated/50"
          @click="showCampaigns(row.id)"
        >
          <td class="w-10 py-2.5 ps-4">
            <DmsIconWell
              :icon="channelStyle(row.id).icon"
              size="sm"
              tone="muted"
            />
          </td>
          <th scope="row" class="px-2 py-2.5 text-left font-normal">
            <div class="flex items-center gap-4">
              <!-- The row's share bar keys the stacked bar from sm; a swatch
                   does below it. -->
              <span
                class="-me-2 size-2 shrink-0 rounded-full sm:hidden"
                :class="channelStyle(row.id).bar"
                aria-hidden="true"
              />
              <button
                type="button"
                class="min-w-0 text-left font-medium text-highlighted hover:underline focus-visible:underline sm:w-36 sm:shrink-0"
                :aria-label="
                  t('page.marketing.acquisition.channels.show_campaigns', {
                    channel: t(`page.marketing.channels.${row.id}`),
                  })
                "
                @click.stop="showCampaigns(row.id)"
              >
                {{ t(`page.marketing.channels.${row.id}`) }}
              </button>
              <span
                class="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-elevated sm:block"
              >
                <span
                  class="block h-full rounded-full"
                  :class="channelStyle(row.id).bar"
                  :style="{ width: `${(row.share / maxShare) * 100}%` }"
                />
              </span>
            </div>
          </th>
          <td
            class="px-2 py-2.5 text-right font-mono tabular-nums text-highlighted"
          >
            {{ formatNumber(row.sessions, locale) }}
          </td>
          <td
            class="px-2 py-2.5 text-right font-mono font-semibold tabular-nums text-highlighted"
          >
            {{ formatPercentage(row.share / 100, locale, fractionDigits(1)) }}
          </td>
          <td class="px-4 py-2.5 text-right">
            <span
              class="rounded px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap tabular-nums"
              :class="deltaClass(row.delta)"
            >
              {{ deltaLabel(row.delta) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <p
      v-if="data?.compareUnavailable && data.total > 0"
      class="mt-auto border-t border-default px-4 py-2 text-xs text-muted"
    >
      {{ t('page.marketing.acquisition.channels.compare_unavailable') }}
    </p>
  </section>
</template>
