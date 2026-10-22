import { createSSRApp, defineComponent, h, ref, toValue } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useFunnelTemplates,
  useHeatmapCountRead,
  useMarketingContextRead,
  usePageHeatmap,
  usePageInventory,
  usePageSnapshot,
  useWebsiteConnection,
  useWebsiteFunnels,
} from '../app/composables/useMarketingReads'
import { useMarketingNow } from '../app/composables/useMarketingNow'

/** What a read asked `useApiData` for. */
interface ReadCall {
  url: () => string | null
  options: Record<string, unknown>
}

let calls: ReadCall[]

const PERIOD = {
  preset: 'last-7-days',
  comparison: 'none',
  range: {
    from: new Date('2026-10-09T00:00:00.000Z'),
    to: new Date('2026-10-15T23:59:59.999Z'),
  },
  compareRange: null,
  key: 'last-7-days',
}

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'useApiData',
    (url: unknown, options: Record<string, unknown> = {}) => {
      calls.push({ url: () => toValue(url as () => string | null), options })
      return { data: ref(null) }
    },
  )
  // The DMS's own, as the module's blocks append a period.
  vi.stubGlobal(
    'appendPeriodToUrl',
    (url: string, state: typeof PERIOD | null) =>
      state?.range
        ? `${url}?from=${state.range.from.toISOString()}&to=${state.range.to.toISOString()}`
        : url,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const query = (call: ReadCall | undefined) =>
  toValue(call?.options.query as () => Record<string, unknown>)

describe('the reads the pages render', () => {
  it('reads nothing bound to the period before there is one, nor without a website', () => {
    const website = ref('')
    const period = ref<typeof PERIOD | null>(null)
    usePageInventory({
      websiteId: website,
      period,
      search: '',
      sort: 'views',
    })
    useFunnelTemplates(website, period)
    const [pages, templates] = calls
    expect(pages?.url()).toBeNull()
    expect(templates?.url()).toBeNull()
    website.value = 'acme-shop'
    expect(pages?.url()).toBeNull()
    period.value = PERIOD
    expect(pages?.url()).toBe(
      '/api/marketing/stats/pages?from=2026-10-09T00:00:00.000Z&to=2026-10-15T23:59:59.999Z',
    )
    expect(query(pages)).toEqual({
      website: 'acme-shop',
      search: '',
      sort: 'views',
    })
    expect(templates?.url()).toContain('/api/marketing/funnels/templates?from=')
    expect(query(templates)).toEqual({ website: 'acme-shop' })
  })

  it('lists a website funnels oldest first, read again with the page refresh', () => {
    useWebsiteFunnels('acme-shop')
    const [funnels] = calls
    expect(funnels?.url()).toBe('/api/marketing/tables/funnels/list')
    expect(query(funnels)).toMatchObject({
      filter_websiteId: 'is:acme-shop',
      sortKey: 'createdAt',
      sortDirection: 'asc',
    })
    // No trigger of its own: the page's refreshes read it again.
    expect(funnels?.options.watch).toBeUndefined()
    expect(funnels?.options.refreshOnPageRefresh).toBeUndefined()
    const transform = funnels?.options.transform as (value: unknown) => unknown
    expect(transform({ results: [{ _id: 'f1' }], total: 1 })).toEqual([
      { _id: 'f1' },
    ])
  })

  it('checks a website connection since a server time, once there is a website', () => {
    const website = ref('')
    const since = ref<number | null>(null)
    useWebsiteConnection(website, since)
    const [connection] = calls
    expect(connection?.url()).toBeNull()
    website.value = 'shop/eu'
    expect(connection?.url()).toBe(
      '/api/marketing/websites/shop%2Feu/connection',
    )
    expect(query(connection)).toEqual({ since: undefined })
    since.value = 1_700_000_000_000
    expect(query(connection)).toEqual({ since: 1_700_000_000_000 })
  })
})

describe('useMarketingNow', () => {
  it('starts from the time the server rendered at, handed to the browser', async () => {
    const state = new Map<string, { value: unknown }>()
    const transferred: string[] = []
    vi.stubGlobal(
      'useDmsState',
      (key: string, init: () => unknown, options?: { transfer?: boolean }) => {
        if (options?.transfer) {
          transferred.push(key)
        }
        if (!state.has(key)) {
          state.set(key, ref(init()))
        }
        return state.get(key)
      },
    )
    state.set('marketing-rendered-at', ref(1_000))
    const app = createSSRApp(
      defineComponent({
        setup: () => {
          const now = useMarketingNow(15_000)
          return () => h('span', String(now.value))
        },
      }),
    )
    expect(await renderToString(app)).toBe('<span>1000</span>')
    expect(transferred).toEqual(['marketing-rendered-at'])
  })
})

describe('the reads with triggers of their own', () => {
  it('reads the context bar on its own clock, not with the page', () => {
    useMarketingContextRead({ refreshInterval: 60_000 })
    const [context] = calls
    expect(context?.options).toMatchObject({
      refreshOnPageRefresh: false,
      refreshInterval: 60_000,
    })
  })

  it('polls the connection check when asked to', () => {
    useWebsiteConnection('acme-shop', null, { refreshInterval: 4000 })
    const [connection] = calls
    expect(connection?.options.refreshInterval).toBe(4000)
  })

  it('follows a reactive polling period, which stops the check at 0', () => {
    const interval = ref(4000)
    useWebsiteConnection('acme-shop', null, { refreshInterval: interval })
    // One read: the polling is the check's own interval, not a second caller.
    expect(calls).toHaveLength(1)
    const [connection] = calls
    const polling = () => toValue(connection?.options.refreshInterval as number)
    expect(polling()).toBe(4000)
    interval.value = 0
    expect(polling()).toBe(0)
  })
})

describe('the page preview', () => {
  it('reads the clicks in the browser only, once there is a site and a path', () => {
    const website = ref<string | undefined>(undefined)
    const period = ref<typeof PERIOD | null>(null)
    usePageHeatmap({ websiteId: website, path: '/pricing', period })
    const [heatmap] = calls
    expect(heatmap?.options.server).toBe(false)
    expect(heatmap?.url()).toBeNull()
    website.value = 'acme-shop'
    // Without a period, the route's default window.
    expect(heatmap?.url()).toBe('/api/marketing/stats/heatmap')
    period.value = PERIOD
    expect(heatmap?.url()).toBe(
      '/api/marketing/stats/heatmap?from=2026-10-09T00:00:00.000Z&to=2026-10-15T23:59:59.999Z',
    )
    expect(query(heatmap)).toEqual({ website: 'acme-shop', path: '/pricing' })
  })

  it('reads no capture while the site keeps none', () => {
    const enabled = ref(false)
    usePageSnapshot({
      websiteId: 'acme-shop',
      path: '/pricing',
      layout: 'phone',
      enabled,
      maskText: false,
    })
    const [snapshot] = calls
    expect(snapshot?.url()).toBeNull()
    enabled.value = true
    expect(snapshot?.url()).toBe('/api/marketing/stats/snapshot')
    expect(query(snapshot)).toEqual({
      website: 'acme-shop',
      path: '/pricing',
      layout: 'phone',
    })
  })

  it('reads the capture again once the text mask changes, which discards it', () => {
    const maskText = ref(false)
    usePageSnapshot({
      websiteId: 'acme-shop',
      path: '/pricing',
      layout: 'desktop',
      enabled: true,
      maskText,
    })
    const [snapshot] = calls
    // Same URL and query: only a watched source reads it again.
    const sources = snapshot?.options.watch as (() => unknown)[] | undefined
    expect(sources?.map((source) => source())).toEqual([false])
    maskText.value = true
    expect(sources?.map((source) => source())).toEqual([true])
    expect(query(snapshot)).toEqual({
      website: 'acme-shop',
      path: '/pricing',
      layout: 'desktop',
    })
  })
})

describe('the reads a dialog makes when it asks', () => {
  it('reads nothing before, then answers or rejects with the read', async () => {
    const data = ref<unknown>(null)
    const error = ref<unknown>(null)
    const execute = vi.fn(async () => {
      data.value = { events: 3, snapshots: 1 }
    })
    vi.stubGlobal(
      'useApiData',
      (url: unknown, options: Record<string, unknown> = {}) => {
        calls.push({ url: () => toValue(url as () => string | null), options })
        return { data, error, execute }
      },
    )
    const countHeatmap = useHeatmapCountRead('acme-shop', '/pricing')
    const [count] = calls
    expect(count?.options).toMatchObject({
      immediate: false,
      refreshOnPageRefresh: false,
    })
    expect(execute).not.toHaveBeenCalled()
    expect(count?.url()).toBe('/api/marketing/stats/heatmap/count')
    expect(query(count)).toEqual({ website: 'acme-shop', path: '/pricing' })
    await expect(countHeatmap()).resolves.toEqual({ events: 3, snapshots: 1 })

    const failure = new Error('gone')
    execute.mockImplementationOnce(async () => {
      error.value = failure
    })
    await expect(countHeatmap()).rejects.toBe(failure)
  })
})
