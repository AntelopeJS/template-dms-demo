import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { MarketingContextPayload } from './useMarketingContext'
import type {
  MarketingConnectionStatus,
  MarketingFunnelListItem,
  MarketingFunnelSuggestions,
  MarketingFunnelTemplate,
  MarketingHeatmap,
  MarketingHeatmapData,
  MarketingPageSnapshotResponse,
  MarketingPages,
  MarketingPagesSort,
  MarketingPeriod,
  MarketingScrollDepth,
  MarketingSnapshotLayout,
  MarketingWebsite,
  MarketingWebsiteCard,
  MarketingWebsiteDeletionImpact,
} from './useMarketingApi'

/**
 * The module's reads, through `useApiData`. What the pages render: a server
 * render reads it and hands it to the browser with the page, the components
 * showing one request share it, and a newer request replaces one still in
 * flight (the answer for a site, page or period the user left never paints
 * over the one on screen). The page preview and the funnel builder draw in
 * the browser only (`server: false`); a dialog or the builder reads what it
 * shows when it asks (`ReadOnDemand`). The page's refreshes
 * (`refreshPageBlocks()`) read every one of them again but the context
 * bar's, which reads on its own clock. Writes go through `useMarketingApi`.
 *
 * A read bound to the period waits for it: the server knows it only once the
 * browser's time zone is known, and the browser once the context bar's
 * selector has set up. Until then nothing is read and the block shows its
 * skeleton, on both sides.
 */

/** Far above any real tenant's funnel count (the data-api caps at 100). */
const FUNNEL_LIST_LIMIT = 100

/** `url` with the period's bounds, or nothing to read without a period. */
function periodRead(
  url: string,
  period: MaybeRefOrGetter<MarketingPeriod>,
): string | null {
  const state = toValue(period)
  return state ? (appendPeriodToUrl(url, state) ?? url) : null
}

/** How the context bar reads the context: on its own clock. */
export interface ContextReadOptions {
  /**
   * Reads again every this many milliseconds while the caller shows the
   * data; a ref or a getter changes it, and `0` or `null` stops it.
   */
  refreshInterval?: MaybeRefOrGetter<number | null | undefined>
}

/**
 * The tenant's websites as the context bar lists them, and the saved pick:
 * read again on the bar's own triggers (its clock, its refresh button), not
 * with the page's blocks.
 */
export function useMarketingContextRead(
  options: ContextReadOptions = {},
): ApiDataResult<MarketingContextPayload> {
  return useApiData<MarketingContextPayload>('/api/marketing/context', {
    refreshOnPageRefresh: false,
    refreshInterval: options.refreshInterval,
  })
}

/** The Websites page's cards. */
export function useWebsiteCards(): ApiDataResult<MarketingWebsiteCard[]> {
  return useApiData<MarketingWebsiteCard[]>('/api/marketing/websites/summary')
}

/** The tenant's websites, with their capture options. */
export function useWebsites(): ApiDataResult<MarketingWebsite[]> {
  return useApiData<MarketingWebsite[]>('/api/marketing/websites')
}

/** The funnels of a website, oldest first; nothing read without one. */
export function useWebsiteFunnels(
  websiteId: MaybeRefOrGetter<string>,
): ApiDataResult<MarketingFunnelListItem[]> {
  return useApiData<MarketingFunnelListItem[]>(
    () => (toValue(websiteId) ? '/api/marketing/tables/funnels/list' : null),
    {
      query: () => ({
        filter_websiteId: `is:${toValue(websiteId)}`,
        limit: FUNNEL_LIST_LIMIT,
        sortKey: 'createdAt',
        sortDirection: 'asc',
      }),
      transform: (value) =>
        (value as { results: MarketingFunnelListItem[] }).results,
    },
  )
}

export interface PageInventoryRequest {
  websiteId: MaybeRefOrGetter<string>
  period: MaybeRefOrGetter<MarketingPeriod>
  search: MaybeRefOrGetter<string>
  sort: MaybeRefOrGetter<MarketingPagesSort>
}

/** The paths a website's visitors loaded over the period. */
export function usePageInventory(
  request: PageInventoryRequest,
): ApiDataResult<MarketingPages> {
  return useApiData<MarketingPages>(
    () =>
      toValue(request.websiteId)
        ? periodRead('/api/marketing/stats/pages', request.period)
        : null,
    {
      query: () => ({
        website: toValue(request.websiteId),
        search: toValue(request.search),
        sort: toValue(request.sort),
      }),
    },
  )
}

/** Funnels built from a website's own journeys over the period. */
export function useFunnelTemplates(
  websiteId: MaybeRefOrGetter<string | undefined>,
  period: MaybeRefOrGetter<MarketingPeriod>,
): ApiDataResult<MarketingFunnelTemplate[]> {
  return useApiData<MarketingFunnelTemplate[]>(
    () =>
      toValue(websiteId)
        ? periodRead('/api/marketing/funnels/templates', period)
        : null,
    { query: () => ({ website: toValue(websiteId) }) },
  )
}

/**
 * Whether a website's tag reached the collector: since its creation, or
 * since `since` (epoch ms, server clock). Polled every
 * `options.refreshInterval` while it is above 0.
 */
export function useWebsiteConnection(
  websiteId: MaybeRefOrGetter<string>,
  since: MaybeRefOrGetter<number | null>,
  options: ContextReadOptions = {},
): ApiDataResult<MarketingConnectionStatus> {
  const path = computed(() => {
    const id = toValue(websiteId)
    return id
      ? `/api/marketing/websites/${encodeURIComponent(id)}/connection`
      : null
  })
  return useApiData<MarketingConnectionStatus>(path, {
    query: () => ({ since: toValue(since) ?? undefined }),
    refreshInterval: options.refreshInterval,
  })
}

/** `url` with the period's bounds, or the routes' default without one. */
function withPeriod(url: string, period: MarketingPeriod): string {
  return period ? (appendPeriodToUrl(url, period) ?? url) : url
}

/** The page of a website the preview shows, over the context's period. */
export interface PagePreviewRequest {
  websiteId: MaybeRefOrGetter<string | undefined>
  path: MaybeRefOrGetter<string>
  period: MaybeRefOrGetter<MarketingPeriod>
}

function previewRead<T>(
  url: string,
  request: PagePreviewRequest,
): ApiDataResult<T> {
  return useApiData<T>(
    () =>
      toValue(request.websiteId) && toValue(request.path)
        ? withPeriod(url, toValue(request.period))
        : null,
    {
      query: () => ({
        website: toValue(request.websiteId),
        path: toValue(request.path),
      }),
      server: false,
    },
  )
}

/** The clicks of a page over the period, drawn in the browser. */
export function usePageHeatmap(
  request: PagePreviewRequest,
): ApiDataResult<MarketingHeatmap> {
  return previewRead('/api/marketing/stats/heatmap', request)
}

/** How far a page's visitors scrolled over the period, drawn in the browser. */
export function usePageScrollDepth(
  request: PagePreviewRequest,
): ApiDataResult<MarketingScrollDepth> {
  return previewRead('/api/marketing/stats/scroll', request)
}

/** The capture of a page a layout shows; nothing read while `enabled` is false. */
export interface PageSnapshotRequest {
  websiteId: MaybeRefOrGetter<string | undefined>
  path: MaybeRefOrGetter<string>
  layout: MaybeRefOrGetter<MarketingSnapshotLayout>
  enabled: MaybeRefOrGetter<boolean>
  /**
   * The site's text mask. Changing it discards the site's captures on the
   * backend while the request stays the same, so the capture is read again.
   */
  maskText: MaybeRefOrGetter<boolean>
}

/** A page's capture in a layout, drawn in the browser. */
export function usePageSnapshot(
  request: PageSnapshotRequest,
): ApiDataResult<MarketingPageSnapshotResponse> {
  return useApiData<MarketingPageSnapshotResponse>(
    () =>
      toValue(request.enabled) &&
      toValue(request.websiteId) &&
      toValue(request.path)
        ? '/api/marketing/stats/snapshot'
        : null,
    {
      query: () => ({
        website: toValue(request.websiteId),
        path: toValue(request.path),
        layout: toValue(request.layout),
      }),
      watch: [() => toValue(request.maskText)],
      server: false,
    },
  )
}

/** The pages and events a website's visitors sent, for the funnel builder. */
export function useFunnelSuggestions(
  websiteId: MaybeRefOrGetter<string>,
): ApiDataResult<MarketingFunnelSuggestions> {
  return useApiData<MarketingFunnelSuggestions>(
    () => (toValue(websiteId) ? '/api/marketing/funnels/suggestions' : null),
    { query: () => ({ website: toValue(websiteId) }), server: false },
  )
}

/** The query of a read made on demand. */
type ReadQuery = MaybeRefOrGetter<Record<string, string | undefined>>

/**
 * A read a dialog or the funnel builder makes when it asks, through
 * `useApiData` with `immediate: false`: the call reads the current URL and
 * resolves with its answer, or rejects with what the read failed with. The
 * caller keeps the answer, so the page's refreshes leave it.
 */
export type ReadOnDemand<T> = () => Promise<T>

function useReadOnDemand<T>(
  url: MaybeRefOrGetter<string | null>,
  query?: ReadQuery,
): ReadOnDemand<T> {
  const read = useApiData<T>(url, {
    query,
    immediate: false,
    refreshOnPageRefresh: false,
  })
  return async () => {
    await read.execute({ dedupe: 'defer' })
    if (read.error.value) {
      throw read.error.value
    }
    return read.data.value as T
  }
}

/** What deleting a website discards, for its confirmation. */
export function useWebsiteDeletionImpactRead(
  websiteId: MaybeRefOrGetter<string>,
): ReadOnDemand<MarketingWebsiteDeletionImpact> {
  return useReadOnDemand(() => {
    const id = toValue(websiteId)
    return id
      ? `/api/marketing/websites/${encodeURIComponent(id)}/deletion`
      : null
  })
}

/** What resetting the clicks of a page, or of the whole site, deletes. */
export function useHeatmapCountRead(
  websiteId: MaybeRefOrGetter<string>,
  path: MaybeRefOrGetter<string | undefined> = undefined,
): ReadOnDemand<MarketingHeatmapData> {
  return useReadOnDemand(
    () => (toValue(websiteId) ? '/api/marketing/stats/heatmap/count' : null),
    () => ({ website: toValue(websiteId), path: toValue(path) }),
  )
}

/** One funnel definition, as the builder edits it. */
export function useFunnelRead(
  funnelId: MaybeRefOrGetter<string>,
): ReadOnDemand<MarketingFunnelListItem> {
  return useReadOnDemand(
    () => (toValue(funnelId) ? '/api/marketing/tables/funnels/get' : null),
    () => ({ id: toValue(funnelId) }),
  )
}

/** The websites and the saved pick, for the builder outside the context bar. */
export function useContextOnDemand(): ReadOnDemand<MarketingContextPayload> {
  return useReadOnDemand('/api/marketing/context')
}
