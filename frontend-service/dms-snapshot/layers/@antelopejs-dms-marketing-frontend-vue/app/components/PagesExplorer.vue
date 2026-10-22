<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDmsRoute, useDmsRouter, useI18n } from '#dms/frontend-module'
import {
  useMarketingApi,
  type MarketingPageEntry,
  type MarketingPages,
  type MarketingPagesSort,
  type MarketingWebsite,
} from '../composables/useMarketingApi'
import {
  useHeatmapCountRead,
  usePageInventory,
  useWebsiteFunnels,
  useWebsites,
} from '../composables/useMarketingReads'
import { useMarketingContext } from '../composables/useMarketingContext'
import { installLink } from '../composables/useMarketingRoutes'
import { PERIOD_SCOPE } from '../constants'
import { parseFunnelStepsValue } from '../composables/useFunnelSteps'
import { formatNumber } from '../utils/format'
import {
  heatmapDataLabel,
  heatmapResetImpact,
  normalizePagePath,
} from '../utils/heatmap'

/**
 * Pages & heatmaps: the paths visitors loaded on the selected website, with
 * the clicks and scroll depth of the selected one over its snapshot.
 *
 * Keyed on nothing but a website id and a pathname the tracker reported — no
 * route registry, no sitemap — which is what makes it hold for any site. The
 * filter is also a path field: a day keeps a capped number of paths, so a page
 * can be missing from the list while its clicks are perfectly queryable.
 */
const props = withDefaults(
  defineProps<{
    periodScope?: string
    componentId?: string
    pageId?: string
  }>(),
  { periodScope: PERIOD_SCOPE, componentId: undefined, pageId: undefined },
)

const SEARCH_DEBOUNCE_MS = 300
const SKELETON_ROWS = 8
/** Where the list and the preview sit side by side (Tailwind `xl`). */
const SIDE_BY_SIDE_QUERY = '(min-width: 1280px)'

const { t, locale } = useI18n()
const route = useDmsRoute()
const router = useDmsRouter()
const api = useMarketingApi()
const context = useMarketingContext()
const toast = useToast()
const { confirm } = useConfirm()

const websiteId = computed(() => context.selected.value?.id ?? '')
const period = usePeriodScope(props.periodScope)
/** The days read: a comparison change alone reads nothing again. */
const pagesPeriod = computed(() =>
  period.value
    ? {
        ...period.value,
        comparison: 'none' as const,
        compareRange: null,
      }
    : null,
)

const queryPath = () =>
  typeof route.query.path === 'string' ? route.query.path : ''
const selectedPath = ref<string | undefined>(queryPath() || undefined)
const search = ref('')
/** The search the list is read with, once the box holds still. */
const searchedTerm = ref('')
const sort = ref<MarketingPagesSort>('views')

// The full row: the context carries the id, the preview needs the snapshot options.
const websitesRead = useWebsites()
const website = computed(
  () =>
    websitesRead.data.value?.find((site) => site._id === websiteId.value) ??
    null,
)

/** A site as its update answered it, in place: the list is not read again. */
function putWebsite(saved: MarketingWebsite): void {
  const sites = websitesRead.data.value
  if (sites) {
    websitesRead.data.value = sites.map((site) =>
      site._id === saved._id ? saved : site,
    )
  }
}

const inventoryRead = usePageInventory({
  websiteId,
  period: pagesPeriod,
  search: searchedTerm,
  sort,
})
const inventory = computed(() =>
  inventoryRead.error.value ? null : inventoryRead.data.value,
)
const loading = computed(() => inventoryRead.status.value === 'pending')
/** A list is on screen (the previous one while another loads), or failed. */
const settled = computed(
  () =>
    inventoryRead.data.value !== null ||
    inventoryRead.status.value === 'success' ||
    inventoryRead.status.value === 'error',
)
const failed = computed(
  () => !!inventoryRead.error.value && inventoryRead.status.value !== 'pending',
)
const loadPages = (): Promise<void> => inventoryRead.refresh()

const funnelsRead = useWebsiteFunnels(websiteId)
const countSiteHeatmap = useHeatmapCountRead(websiteId)
const funnels = computed(() =>
  funnelsRead.error.value ? [] : (funnelsRead.data.value ?? []),
)

watch(websiteId, () => {
  selectedPath.value = undefined
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(
    () => (searchedTerm.value = value.trim()),
    SEARCH_DEBOUNCE_MS,
  )
})
onBeforeUnmount(() => searchTimer && clearTimeout(searchTimer))

const pages = computed(() => inventory.value?.pages ?? [])
const sampleRate = computed(() => inventory.value?.sampleRate ?? null)
/** The measured sampling share as a sentence writes it: "10%", "0.4%". */
const sampleRateLabel = computed(() => {
  const rate = sampleRate.value
  return rate === null
    ? null
    : String(
        formatPercentage(rate, locale.value, {
          maximumFractionDigits: rate > 0 && rate < 0.01 ? 1 : 0,
        }),
      )
})
const trackerEnabled = computed(() => inventory.value?.trackerEnabled ?? true)
const waiting = computed(() => context.selected.value?.state === 'waiting')

function metricOf(page: { pageviews: number; clicks: number }): number {
  return sort.value === 'clicks' ? page.clicks : page.pageviews
}

const maxMetric = computed(() => Math.max(1, ...pages.value.map(metricOf)))

/**
 * A pick in the list is a navigation the Back button undoes; a selection
 * made for the reader (first load, website switch) only completes the URL.
 * Keeps the rest of the query: the context bar mirrors its own state there.
 */
function selectPath(path: string | undefined, mode: 'push' | 'replace'): void {
  selectedPath.value = path
  void router[mode]({ query: { ...route.query, path: path ?? undefined } })
}

/** Back and Forward move the selection with the URL. */
watch(queryPath, (path) => {
  if (path && path !== selectedPath.value) {
    selectedPath.value = path
  }
})

// A first impression that shows the feature: the first page with clicks,
// else the first page. In the browser: the list a server render hands over
// is chosen from once mounted.
function selectFirst(data: MarketingPages | null): void {
  if (!selectedPath.value && data?.pages.length) {
    const withClicks = data.pages.find((page) => page.clicks > 0)
    selectPath((withClicks ?? data.pages[0])?.path, 'replace')
  }
}
watch(inventory, selectFirst)

const previewWrapper = ref<HTMLElement | null>(null)

/** Stacked under the list (below xl), the preview is out of sight: bring it in. */
async function pick(path: string): Promise<void> {
  selectPath(path, 'push')
  if (window.matchMedia(SIDE_BY_SIDE_QUERY).matches) {
    return
  }
  await nextTick()
  previewWrapper.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const typedPath = computed(() => normalizePagePath(search.value))

/** Enter inspects what was typed, listed or not, reduced like a tracked URL. */
function inspectTyped(): void {
  if (typedPath.value) {
    void pick(typedPath.value)
  }
}

/**
 * The selected path's row, kept while a filter hides it from the list: the
 * preview header keeps its views.
 */
const selectedPage = ref<MarketingPageEntry>()
watch([pages, selectedPath], ([list, path]) => {
  const found = list.find((page) => page.path === path)
  if (found || selectedPage.value?.path !== path) {
    selectedPage.value = found
  }
})

/** Funnels with a page step on the selected path, for the "Used in" card. */
const usedIn = computed(() =>
  funnels.value.filter((funnel) =>
    parseFunnelStepsValue(funnel.steps).some(
      (step) => step.kind === 'url' && step.value === selectedPath.value,
    ),
  ),
)

// The preview draws in the browser only (frames, canvases): a server render
// holds its place.
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
  selectFirst(inventory.value)
})

const countLabel = computed(() => {
  const listed = pages.value.length
  const total = inventory.value?.total ?? listed
  return total > listed
    ? t('page.marketing.pages.count_of', { count: listed, total }, total)
    : t('page.marketing.pages.count', { count: listed }, listed)
})

const sortItems = computed(() => [
  { value: 'views', label: t('page.marketing.pages.views') },
  { value: 'clicks', label: t('page.marketing.pages.overlay.clicks') },
])

async function resetSite(): Promise<void> {
  const site = website.value
  if (!site) {
    return
  }
  const counts = await countSiteHeatmap().catch(() => null)
  await confirm({
    title: t('page.marketing.pages.reset.site_title', { name: site.name }),
    description: t('page.marketing.pages.reset.site_description'),
    color: 'error',
    icon: 'i-ph-eraser',
    confirmLabel:
      counts && counts.events + counts.snapshots > 0
        ? t('page.marketing.pages.reset.confirm_count', {
            what: heatmapDataLabel(counts, t, locale.value),
          })
        : t('page.marketing.pages.reset.confirm'),
    confirmText: site.domain,
    // A hostname is not case-sensitive: neither is the typed check.
    confirmTextCaseInsensitive: true,
    impact: heatmapResetImpact(counts, t, locale.value),
    onConfirm: async () => {
      const deleted = await api.resetHeatmap(site._id)
      toast.add({
        color: 'success',
        title: t('page.marketing.pages.reset.site_done', { name: site.name }),
        description: t('page.marketing.pages.reset.done', {
          what: heatmapDataLabel(deleted, t, locale.value),
        }),
      })
      // The dialog closes once the pages show the emptied counts.
      await refreshPageBlocks()
    },
  })
}

const moreItems = computed(() => [
  [
    {
      label: t('page.marketing.pages.reset.site_button'),
      icon: 'i-ph-eraser',
      color: 'error' as const,
      onSelect: () => void resetSite(),
    },
  ],
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- The Pages page's context bar shows its own guide first; this one
         serves the block placed under a bar without it. -->
    <DmsEmptyState
      v-if="waiting"
      icon="i-ph-hourglass"
      class="dms-card"
      :title="
        t('page.marketing.pages.waiting.title', {
          website: context.selected.value?.name ?? '',
        })
      "
      :description="t('page.marketing.pages.waiting.description')"
    >
      <template #actions>
        <UButton
          size="sm"
          icon="i-ph-plugs-connected"
          :label="t('page.marketing.pages.waiting.action')"
          :to="installLink(websiteId)"
        />
      </template>
    </DmsEmptyState>

    <template v-else>
      <!-- The preview's own strip says it when a page is shown. -->
      <DmsBanner
        v-if="!trackerEnabled && !(selectedPath && website)"
        tone="error"
        size="sm"
        icon="i-ph-plugs"
        :title="t('page.marketing.pages.tracking_off.title')"
        :description="t('page.marketing.pages.tracking_off.description')"
      />

      <div class="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section
          class="dms-card flex min-w-0 flex-col overflow-hidden p-0 xl:sticky xl:top-4"
        >
          <div class="flex items-center gap-2 border-b border-default p-3">
            <UInput
              v-model="search"
              size="sm"
              icon="i-ph-magnifying-glass"
              class="flex-1"
              :placeholder="t('page.marketing.pages.search_placeholder')"
              @keyup.enter="inspectTyped"
            />
            <UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three"
                size="sm"
                color="neutral"
                variant="ghost"
                :aria-label="t('page.marketing.pages.more_list')"
              />
            </UDropdownMenu>
          </div>
          <div class="flex items-center justify-between gap-2 px-4 py-2">
            <DmsEyebrow :label="countLabel" />
            <DmsSegmented
              v-model="sort"
              :items="sortItems"
              size="xs"
              :aria-label="t('page.marketing.pages.sort')"
            />
          </div>
          <DmsEmptyState
            v-if="failed"
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
                @click="loadPages"
              />
            </template>
          </DmsEmptyState>
          <ul
            v-else-if="!settled"
            class="flex flex-col gap-1 p-2"
            aria-hidden="true"
          >
            <li v-for="index in SKELETON_ROWS" :key="index" class="px-2 py-2">
              <USkeleton class="h-8 w-full" />
            </li>
          </ul>
          <DmsEmptyState
            v-else-if="pages.length === 0 && search.trim()"
            icon="i-ph-magnifying-glass"
            size="sm"
            :title="t('page.marketing.pages.no_match.title')"
            :description="t('page.marketing.pages.no_match.description')"
          >
            <template v-if="typedPath" #actions>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-ph-cursor-click"
                :label="
                  t('page.marketing.pages.no_match.inspect', {
                    path: typedPath,
                  })
                "
                @click="inspectTyped"
              />
            </template>
          </DmsEmptyState>
          <DmsEmptyState
            v-else-if="pages.length === 0"
            icon="i-ph-browser"
            size="sm"
            :title="
              t('page.marketing.pages.no_pages.title', {
                website: context.selected.value?.name ?? '',
              })
            "
            :description="t('page.marketing.pages.no_pages.description')"
          />
          <ul
            v-else
            class="flex max-h-[45vh] flex-col gap-1 overflow-y-auto p-2 xl:max-h-[70vh]"
            :class="loading ? 'opacity-60' : ''"
          >
            <li v-for="page in pages" :key="page.path">
              <button
                type="button"
                class="flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors"
                :class="
                  page.path === selectedPath
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:bg-elevated'
                "
                :title="page.path"
                :aria-current="page.path === selectedPath ? 'true' : undefined"
                @click="pick(page.path)"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="min-w-0 flex-1 truncate font-mono text-[13px]"
                    :class="
                      page.path === selectedPath
                        ? 'font-medium text-highlighted'
                        : 'text-highlighted'
                    "
                  >
                    {{ page.path }}
                  </span>
                  <span class="font-mono text-xs tabular-nums text-highlighted">
                    {{ formatNumber(metricOf(page), locale) }}
                  </span>
                </span>
                <span class="flex items-center gap-2">
                  <span
                    class="flex flex-1 items-center gap-1 text-[11px]"
                    :class="
                      page.path === selectedPath ? 'text-muted' : 'text-dimmed'
                    "
                  >
                    <template v-if="sort === 'views'">
                      <UIcon name="i-ph-cursor-click" class="size-3" />
                      {{
                        t(
                          'page.marketing.pages.row_clicks',
                          { count: formatNumber(page.clicks, locale) },
                          page.clicks,
                        )
                      }}
                    </template>
                    <template v-else>
                      <UIcon name="i-ph-eye" class="size-3" />
                      {{
                        t(
                          'page.marketing.pages.row_views',
                          { count: formatNumber(page.pageviews, locale) },
                          page.pageviews,
                        )
                      }}
                    </template>
                  </span>
                  <span
                    class="h-1 w-14 overflow-hidden rounded-full bg-elevated"
                    aria-hidden="true"
                  >
                    <span
                      class="block h-full rounded-full bg-primary"
                      :style="{
                        width: `${(metricOf(page) / maxMetric) * 100}%`,
                      }"
                    />
                  </span>
                </span>
              </button>
            </li>
          </ul>
          <footer
            class="flex items-center gap-1.5 border-t border-default px-4 py-2.5 text-xs text-dimmed"
          >
            <UIcon name="i-ph-info" class="size-3.5 shrink-0" />
            {{
              inventory?.truncated
                ? t('page.marketing.pages.list_truncated', {
                    count: pages.length,
                  })
                : t('page.marketing.pages.missing_hint')
            }}
          </footer>
        </section>

        <div
          v-if="(selectedPath && website) || (!mounted && pages.length > 0)"
          ref="previewWrapper"
          class="min-w-0 scroll-mt-4"
        >
          <USkeleton
            v-if="!mounted || !selectedPath || !website"
            class="h-[32rem] rounded-xl"
            aria-hidden="true"
          />
          <DmsMarketingPagePreview
            v-else
            :website="website"
            :path="selectedPath"
            :period="period"
            :sample-rate-label="sampleRateLabel"
            :tracker-enabled="trackerEnabled"
            :pageviews="selectedPage?.pageviews"
            :used-in="usedIn"
            @website-updated="putWebsite"
          />
        </div>
        <DmsEmptyState
          v-else-if="settled && pages.length > 0"
          icon="i-ph-cursor-click"
          class="dms-card"
          :title="t('page.marketing.pages.select_hint')"
        />
      </div>
      <p v-if="sampleRateLabel !== null" class="text-xs text-dimmed">
        {{
          t('page.marketing.pages.sampling_note', {
            rate: sampleRateLabel,
          })
        }}
      </p>
    </template>
  </div>
</template>
