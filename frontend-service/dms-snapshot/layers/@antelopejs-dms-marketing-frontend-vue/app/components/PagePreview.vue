<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '#dms/frontend-module'
import {
  useMarketingApi,
  type MarketingPeriod,
  type MarketingSnapshotLayout,
  type MarketingWebsite,
  type MarketingWebsitePatch,
  type MarketingFunnelListItem,
} from '../composables/useMarketingApi'
import {
  useHeatmapCountRead,
  usePageHeatmap,
  usePageScrollDepth,
  usePageSnapshot,
  type PagePreviewRequest,
} from '../composables/useMarketingReads'
import { funnelLink, settingsLink } from '../composables/useMarketingRoutes'
import { formatNumber, formatShortDate } from '../utils/format'
import {
  heatmapDataLabel,
  heatmapResetImpact,
} from '../utils/heatmap'
import { heatLegendGradient } from '../utils/heatmapPalette'
import {
  DEFAULT_RENDER_HEIGHT,
  MAX_RENDER_HEIGHT,
  MAX_RENDER_WIDTH,
  MIN_RENDER_HEIGHT,
  useSnapshotFrame,
  type AnchorBox,
  type AnchorRequest,
} from '../composables/useSnapshotFrame'
import { rewriteViewportUnits } from '../utils/snapshotViewportUnits'

/**
 * Click and scroll-depth overlays of one tracked page, over a snapshot of
 * that page. The two overlays switch above ONE persistent frame — plain
 * buttons, never a Tab block, whose default unmounting of hidden slots would
 * tear the frame down and re-measure it on every switch.
 *
 * The invariant of this surface: THE NUMBERS NEVER DEGRADE. Points, weights
 * and totals come from the database; the snapshot is the surface they are
 * drawn on. Without one — snapshots off for the site, no sampled visit
 * captured yet — nothing is drawn: the counts stay in the header, the
 * banner says why the page has no backdrop and when it will, and no empty
 * pane pretends to be a page.
 *
 * The wallpaper is a captured DOM, not the live site: what a sampled visitor
 * saw, rendered in a `srcdoc` frame sandboxed without scripts. Same-origin,
 * so its geometry is read directly; inert, so pointer events never reach it
 * and nothing in it can be clicked, hovered or navigated. Interacting with
 * the real page goes through "open in a new tab".
 *
 * ## Geometry
 *
 * The frame is laid out at the chosen width and pinned to the captured
 * viewport height until the snapshot's size is read (see useSnapshotFrame)
 * — never at the height it is about to report, which is what would make
 * every `100vh` page grow without bound. Once a size is published the frame
 * expands to it, once. Viewport-relative units are rewritten to the pixels
 * they had in the visitor's viewport before the document is rendered (see
 * rewriteViewportUnits), so the reading is the visitor's page height and
 * the resize changes nothing inside. The frame is remounted (`:key`)
 * whenever the snapshot or the layout width changes, so the composable
 * re-arms on a fresh document.
 */
const props = defineProps<{
  website: MarketingWebsite | null
  path: string
  /** Days the counts cover — the context bar's period scope. */
  period: MarketingPeriod
  /**
   * Measured share of the site's page loads sampled for clicks, written for
   * a sentence — why a quiet page looks empty. Null while too few pageviews
   * tell it.
   */
  sampleRateLabel: string | null
  trackerEnabled: boolean
  /** Pageviews of this path over the window, for the sampling hint. */
  pageviews?: number
  /** Funnels with a page step on this path. */
  usedIn?: MarketingFunnelListItem[]
}>()

/** The site's snapshot options were saved here, as the backend answered
 * them; the parent owns the row. */
const emit = defineEmits<{
  'website-updated': [website: MarketingWebsite]
}>()

interface LayoutPreset {
  width: number
  layout: MarketingSnapshotLayout
  icon: string
  labelKey: string
}

/**
 * Layouts offered for inspection; a mobile layout is a different page. The
 * tablet is upright on purpose: lying flat it is 1024+ wide, a width most
 * breakpoints already dress as desktop — the button would repeat 1280.
 */
const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    width: 1280,
    layout: 'desktop',
    icon: 'i-ph-monitor',
    labelKey: 'page.marketing.pages.preview.layout_desktop',
  },
  {
    width: 768,
    layout: 'tablet',
    icon: 'i-ph-device-tablet',
    labelKey: 'page.marketing.pages.preview.layout_tablet',
  },
  {
    width: 390,
    layout: 'phone',
    icon: 'i-ph-device-mobile',
    labelKey: 'page.marketing.pages.preview.layout_phone',
  },
]
const DEFAULT_LAYOUT_WIDTH = 1280
/** Viewport the snapshot is measured through when it recorded none. */
const PROBE_VIEWPORT_HEIGHT = 900
/** Height of the scrollable pane the scaled surface lives in. */
const PANE_HEIGHT = 620
/** Overflow beyond the chosen layout width worth telling the operator about. */
const OVERFLOW_TOLERANCE = 1.05
const SNAPSHOT_BYTE_CAP = 1024 * 1024
const LIGHT_CANVAS = '#ffffff'
const DARK_CANVAS = '#111111'

const api = useMarketingApi()
const { t, locale } = useI18n()

// --- Heatmap ----------------------------------------------------------------

// Path, site and period all read again, and a newer read replaces one still
// in flight: a slow answer for the page the user just left never repaints
// over the one on screen. Drawn in the browser only.
const previewRequest: PagePreviewRequest = {
  websiteId: () => props.website?._id,
  path: () => props.path,
  period: () => props.period,
}
const heatmapRead = usePageHeatmap(previewRequest)
const heatmap = computed(() =>
  heatmapRead.error.value ? null : heatmapRead.data.value,
)
const loading = computed(() => heatmapRead.pending.value)
const failed = computed(() => !!heatmapRead.error.value && !loading.value)

const points = computed(() => heatmap.value?.points ?? [])
const maxWeight = computed(() => heatmap.value?.maxWeight ?? 0)
const totalClicks = computed(() => heatmap.value?.totalClicks ?? 0)

// --- Scroll depth -----------------------------------------------------------

const overlayMode = ref<'clicks' | 'scroll'>('clicks')

// Read with the clicks, not when its overlay opens: every sampled view
// reports one depth, so its count is the page's sampled views the header
// and the empty states speak of.
const scrollRead = usePageScrollDepth(previewRequest)
const scrollDepth = computed(() =>
  scrollRead.error.value ? null : scrollRead.data.value,
)
const loadingScroll = computed(() => scrollRead.pending.value)
const scrollFailed = computed(
  () => !!scrollRead.error.value && !loadingScroll.value,
)

const scrollViews = computed(() => scrollDepth.value?.views ?? 0)
const scrollReached = computed(() => scrollDepth.value?.reached ?? [])

/** Deepest depth at least half of the sampled views reached. */
const medianDepth = computed(() => {
  const half = scrollViews.value / 2
  for (let depth = scrollReached.value.length - 1; depth >= 0; depth--) {
    if ((scrollReached.value[depth] ?? 0) >= half) {
      return depth
    }
  }
  return 0
})

/**
 * Where depth 0 sits on the drawn page: the bottom of the first screen.
 * Depth is a fraction of the visitor's scrollable range; the captured
 * viewport stands in for the visitors' real ones, so the overlay claims
 * bands, not pixels.
 */
const scrollFoldRatio = computed(() =>
  renderHeight.value > 0
    ? Math.min(probeHeight.value / renderHeight.value, 1)
    : 1,
)

// --- Reset ------------------------------------------------------------------

const { confirm } = useConfirm()
const toast = useToast()
const resetting = ref(false)

const countPageHeatmap = useHeatmapCountRead(
  () => props.website?._id ?? '',
  () => props.path,
)

/** Deletes the clicks, scrolls and snapshots of the page (every period),
 *  counted by the server before asking; the page's reads follow. */
async function resetPageHeatmap() {
  const website = props.website
  if (!website) {
    return
  }
  const path = props.path
  resetting.value = true
  const counts = await countPageHeatmap()
    .catch(() => null)
    .finally(() => (resetting.value = false))
  await confirm({
    title: t('page.marketing.pages.reset.page_title'),
    description: t('page.marketing.pages.reset.page_description'),
    color: 'error',
    icon: 'i-ph-eraser',
    confirmLabel:
      counts && counts.events + counts.snapshots > 0
        ? t('page.marketing.pages.reset.confirm_count', {
            what: heatmapDataLabel(counts, t, locale.value),
          })
        : t('page.marketing.pages.reset.confirm'),
    confirmText: path,
    impact: heatmapResetImpact(counts, t, locale.value),
    onConfirm: async () => {
      resetting.value = true
      try {
        const deleted = await api.resetHeatmap(website._id, path)
        toast.add({
          color: 'success',
          title: t('page.marketing.pages.reset.page_done'),
          description: t('page.marketing.pages.reset.done', {
            what: heatmapDataLabel(deleted, t, locale.value),
          }),
        })
        // The preview shows the emptied page before the button comes back.
        await refreshPageBlocks()
      } finally {
        resetting.value = false
      }
    },
  })
}

// --- Snapshot ---------------------------------------------------------------

const layoutWidth = ref(DEFAULT_LAYOUT_WIDTH)

const layout = computed<MarketingSnapshotLayout>(
  () =>
    LAYOUT_PRESETS.find((preset) => preset.width === layoutWidth.value)
      ?.layout ?? 'desktop',
)

const snapshotsEnabled = computed(
  () => props.website?.snapshotsEnabled ?? false,
)

// Not fetched while the site has snapshots off: the option's banner is the
// whole story then, and a leftover capture must not contradict it.
const snapshotRead = usePageSnapshot({
  websiteId: () => props.website?._id,
  path: () => props.path,
  layout,
  enabled: snapshotsEnabled,
  maskText: () => props.website?.snapshotMaskText === true,
})
const isSnapshotAsked = computed(
  () => snapshotsEnabled.value && !!props.website?._id && !!props.path,
)
/** A capture was asked and answered, or there is none to ask for. */
const snapshotSettled = computed(
  () =>
    !isSnapshotAsked.value ||
    snapshotRead.status.value === 'success' ||
    snapshotRead.status.value === 'error',
)

const snapshot = computed(() =>
  snapshotRead.error.value ? null : (snapshotRead.data.value?.snapshot ?? null),
)

const backdrop = computed(() => snapshot.value?.html ?? null)

/** The document the frame renders: the capture, its viewport units fixed
 *  to the visitor's screen at the width being looked at. */
const frameDocument = computed(() =>
  snapshot.value && backdrop.value !== null
    ? rewriteViewportUnits(backdrop.value, {
        width: layoutWidth.value,
        height: snapshot.value.viewport.height,
      })
    : '',
)
const noSnapshotYet = computed(
  () =>
    snapshotsEnabled.value && snapshotSettled.value && snapshot.value === null,
)
const tooHeavy = computed(
  () => snapshot.value !== null && backdrop.value === null,
)
const snapshotScheme = computed(() => snapshot.value?.colorScheme ?? 'light')

function mebibytes(bytes: number): string {
  return new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024))
}

const savingOptions = ref(false)

async function updateSnapshotOptions(
  patch: MarketingWebsitePatch,
): Promise<void> {
  const website = props.website
  if (!website) {
    return
  }
  savingOptions.value = true
  try {
    emit('website-updated', await api.updateWebsite(website._id, patch))
  } catch {
    toast.add({
      color: 'error',
      title: t('page.marketing.pages.preview.options_error'),
    })
  } finally {
    savingOptions.value = false
  }
}

// --- Frame geometry ---------------------------------------------------------

const frame = ref<HTMLIFrameElement | null>(null)
const { measuredWidth, measuredHeight, tier, measureAnchors } =
  useSnapshotFrame(frame)

const frameKey = computed(() =>
  [
    props.path,
    snapshot.value?.layout,
    snapshot.value?.capturedAt,
    layoutWidth.value,
  ].join('|'),
)

/** Viewport the frame is pinned to until its size is read. */
const probeHeight = computed(
  () => snapshot.value?.viewport.height ?? PROBE_VIEWPORT_HEIGHT,
)

/**
 * Height of the drawn surface — the overlay's coordinate space. Falls back to
 * a typical long page while the real one is unknown, so the heatmap is
 * readable before (and without) any snapshot.
 */
const renderHeight = computed(() => {
  const chosen = measuredHeight.value
  if (chosen !== null) {
    return Math.min(Math.max(chosen, MIN_RENDER_HEIGHT), MAX_RENDER_HEIGHT)
  }
  return DEFAULT_RENDER_HEIGHT
})

/**
 * Height of the frame itself. Pinned to the probe viewport while a reading
 * is still possible — resizing it earlier would corrupt the very number
 * being waited on. An operator override takes it back by hand.
 */
const frameHeight = computed(() => {
  if (measuredHeight.value !== null) {
    return measuredHeight.value
  }
  return tier.value === 'pending' ? probeHeight.value : renderHeight.value
})

/**
 * Width the overlay maps onto. Clicks are normalized against the document's
 * `scrollWidth`, so a document wider than the frame must widen the canvas or
 * every x is compressed — while the frame itself stays at the chosen layout
 * width, which is what keeps the width buttons meaningful. The overflowing
 * part is clipped by the pane, exactly as it is clipped inside the frame.
 */
const overlayWidth = computed(() =>
  Math.min(
    Math.max(measuredWidth.value ?? 0, layoutWidth.value),
    MAX_RENDER_WIDTH,
  ),
)

// --- Element anchoring ------------------------------------------------------

/**
 * A click is stored twice: as a document fraction, and as an offset inside
 * the element it hit. Only the second survives being read back at another
 * size — a document fraction divides by a box that, on a page shorter than
 * the visitor's window, IS that window, so the same button arrives here as a
 * different fraction per visitor. Given the element's box in the layout on
 * screen, the offset puts the point back where the visitor put it.
 *
 * The boxes come from the snapshot document. Every way that can fail — no
 * snapshot, an element that no longer exists, a selector that became
 * ambiguous — resolves to no box, and a point with no box keeps its document
 * fraction, never a blank one.
 */
const anchorBoxes = ref(new Map<string, AnchorBox>())

function anchorKey(anchor: AnchorRequest): string {
  return `${anchor.selector}\0${anchor.nth}`
}

const requestedAnchors = computed(() => {
  const unique = new Map<string, AnchorRequest>()
  for (const point of points.value) {
    if (!point.anchor) {
      continue
    }
    const request = { selector: point.anchor.selector, nth: point.anchor.nth }
    unique.set(anchorKey(request), request)
  }
  return [...unique.values()]
})

/** Points in the overlay's coordinate space, anchored where one resolved. */
const drawnPoints = computed(() =>
  points.value.map((point) => {
    const anchor = point.anchor
    if (!anchor) {
      return point
    }
    const box = anchorBoxes.value.get(anchorKey(anchor))
    if (!box || overlayWidth.value <= 0 || renderHeight.value <= 0) {
      return point
    }
    return {
      ...point,
      x: (box.x + anchor.ox * box.width) / overlayWidth.value,
      y: (box.y + anchor.oy * box.height) / renderHeight.value,
    }
  }),
)

let measureToken = 0

/**
 * Re-measure whenever the layout the boxes were taken in changes. The token
 * drops a pass for a geometry that is no longer on screen: the frame is
 * resized from the published reading, and a box read before that resize has
 * been laid out measures the probe viewport.
 */
async function refreshAnchorBoxes(): Promise<void> {
  const token = ++measureToken
  if (tier.value !== 'measured' || requestedAnchors.value.length === 0) {
    if (anchorBoxes.value.size > 0) {
      anchorBoxes.value = new Map()
    }
    return
  }
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  if (token !== measureToken) {
    return
  }
  const resolved = new Map<string, AnchorBox>()
  for (const box of measureAnchors(requestedAnchors.value)) {
    resolved.set(anchorKey(box), box)
  }
  anchorBoxes.value = resolved
}

watch(
  [requestedAnchors, tier, renderHeight, overlayWidth],
  () => void refreshAnchorBoxes(),
)

/**
 * The document does not fit the surface the canvas can allocate. Both are
 * clamped, so the overlay is uniformly compressed against a backdrop that
 * is merely cut off — the two no longer line up, and that is worth saying
 * rather than showing.
 */
const oversized = computed(
  () =>
    (measuredHeight.value ?? 0) > MAX_RENDER_HEIGHT ||
    (measuredWidth.value ?? 0) > MAX_RENDER_WIDTH,
)

const overflowing = computed(
  () => (measuredWidth.value ?? 0) > layoutWidth.value * OVERFLOW_TOLERANCE,
)

// The surface is laid out at `layoutWidth` and zoomed down to the pane, so the
// overlay and the page share one coordinate space at any container size.
// `zoom`, not `transform: scale()`: a transformed frame is rasterized at its
// natural size and resampled, and at a fractional scale the thin borders of
// inputs and cards drop out; zoom reaches the frame's document as a page
// zoom, laid out at the same CSS width and painted crisp at the scale. The
// pane always reserves its scrollbar (`overflow-y-scroll`): letting it appear
// and disappear would change the width the scale is derived from, which
// changes the height, which decides whether the scrollbar is there at all.
const container = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
let observer: ResizeObserver | null = null

watch(container, (el) => {
  observer?.disconnect()
  observer = null
  if (!el) {
    return
  }
  containerWidth.value = el.clientWidth
  observer = new ResizeObserver(() => {
    containerWidth.value = el.clientWidth
  })
  observer.observe(el)
})

onBeforeUnmount(() => observer?.disconnect())

// Only ever scaled down: a phone or tablet layout narrower than the pane is
// shown at its own width, centred like a device, never blown up to fill it.
const scale = computed(() =>
  containerWidth.value > 0
    ? Math.min(1, containerWidth.value / layoutWidth.value)
    : 1,
)

/** Width of the drawn surface in the pane's own pixels. */
const surfaceWidth = computed(() => Math.round(layoutWidth.value * scale.value))

/** Height of the zoomed surface in the pane's own pixels — the scroll range
 *  of the pane and the space the scroll-depth overlay draws in. */
const scrolledHeight = computed(() =>
  Math.round(renderHeight.value * scale.value),
)

/**
 * The pane grows with the page, up to the window's height: a short capture
 * leaves no empty band below it, and a long one scrolls inside a pane that
 * still fits the screen. The border is counted, or a 2px scroll would remain.
 */
const paneStyle = computed(() => ({
  height: `${scrolledHeight.value + 2}px`,
  maxHeight: 'calc(100dvh - 8rem)',
  minHeight: '12rem',
}))

// --- Emptiness, explained ---------------------------------------------------


/** Silence has shared causes (collection off, no view sampled) before the
 *  per-overlay one; both overlays explain themselves through this. */
function captureEmptyReason(fallbackKey: string): string {
  if (!props.trackerEnabled) {
    return t('page.marketing.pages.empty.tracking_off')
  }
  if (props.pageviews && scrollViews.value === 0) {
    return props.sampleRateLabel === null
      ? t('page.marketing.pages.empty.none_sampled')
      : t('page.marketing.pages.empty.none_sampled_rate', {
          rate: props.sampleRateLabel,
        })
  }
  return t(fallbackKey)
}

const emptyState = computed(() => {
  if (overlayMode.value === 'clicks') {
    if (loading.value || heatmap.value === null || totalClicks.value > 0) {
      return null
    }
    return {
      title: t('page.marketing.pages.empty.title'),
      description: captureEmptyReason('page.marketing.pages.empty.no_clicks'),
    }
  }
  if (
    loadingScroll.value ||
    scrollDepth.value === null ||
    scrollViews.value > 0
  ) {
    return null
  }
  return {
    title: t('page.marketing.pages.empty.scroll_title'),
    description: captureEmptyReason('page.marketing.pages.empty.no_scrolls'),
  }
})

// --- Per-overlay surface state ----------------------------------------------

const activeFailed = computed(() =>
  overlayMode.value === 'clicks' ? failed.value : scrollFailed.value,
)

const activeLoading = computed(() =>
  overlayMode.value === 'clicks' ? loading.value : loadingScroll.value,
)

function retryActive(): void {
  if (overlayMode.value === 'clicks') {
    void heatmapRead.refresh()
    return
  }
  void scrollRead.refresh()
}

const truncatedState = computed(() => {
  if (overlayMode.value === 'clicks' && heatmap.value?.truncated) {
    return {
      title: t('page.marketing.pages.truncated'),
      description: t('page.marketing.pages.truncated_hint'),
    }
  }
  if (overlayMode.value === 'scroll' && scrollDepth.value?.truncated) {
    return {
      title: t('page.marketing.pages.scroll.truncated'),
      description: t('page.marketing.pages.scroll.truncated_hint'),
    }
  }
  return null
})

const LOCAL_HOST = /^(localhost|127\.|\[?::1\]?$)/

/** The real page — opened, never framed: on the origin the snapshot was
 *  captured from, else on the site's declared domain. */
const externalUrl = computed(() => {
  const domain = props.website?.domain
  const origin =
    snapshot.value?.origin ??
    (domain
      ? `${LOCAL_HOST.test(domain) ? 'http' : 'https'}://${domain}`
      : null)
  if (!origin || !props.path) {
    return ''
  }
  try {
    return new URL(props.path, origin).toString()
  } catch {
    return ''
  }
})

// --- One status strip -------------------------------------------------------

interface StripAction {
  label: string
  run?: () => void
  to?: string
}

interface StatusStrip {
  tone: 'error' | 'warning' | 'info' | 'primary' | 'success'
  neutral?: boolean
  icon: string
  title: string
  description: string
  action?: StripAction
}

/**
 * Highest priority first: one strip says what needs attention, instead of
 * every applicable alert stacked above the page. The numbers in the header
 * stay exact whatever it says.
 */
const statusStrip = computed<StatusStrip | null>(() => {
  const candidates: Array<StatusStrip | null> = [
    !props.trackerEnabled
      ? {
          tone: 'error',
          icon: 'i-ph-plugs',
          title: t('page.marketing.pages.strip.collection_off'),
          description: t('page.marketing.pages.strip.collection_off_hint'),
          action: {
            label: t('page.marketing.pages.strip.open_settings'),
            to: settingsLink(),
          },
        }
      : null,
    !snapshotsEnabled.value
      ? {
          tone: 'info',
          icon: 'i-ph-camera-slash',
          title: t('page.marketing.pages.preview.snapshots_off'),
          description: t('page.marketing.pages.preview.snapshots_off_hint'),
          action: {
            label: t('page.marketing.pages.preview.enable_snapshots'),
            run: () => void updateSnapshotOptions({ snapshotsEnabled: true }),
          },
        }
      : null,
    noSnapshotYet.value
      ? {
          tone: 'primary',
          icon: 'i-ph-hourglass',
          title: t('page.marketing.pages.preview.no_snapshot'),
          description:
            props.sampleRateLabel === null
              ? t('page.marketing.pages.preview.no_snapshot_hint')
              : t('page.marketing.pages.preview.no_snapshot_hint_rate', {
                  rate: props.sampleRateLabel,
                }),
        }
      : null,
    snapshot.value && tooHeavy.value
      ? {
          tone: 'warning',
          icon: 'i-ph-file-x',
          title: t('page.marketing.pages.preview.too_heavy'),
          description: t('page.marketing.pages.preview.too_heavy_hint', {
            size: mebibytes(snapshot.value.bytes),
            limit: mebibytes(SNAPSHOT_BYTE_CAP),
          }),
        }
      : null,
    truncatedState.value
      ? {
          tone: 'warning',
          icon: 'i-ph-warning',
          title: truncatedState.value.title,
          description: truncatedState.value.description,
        }
      : null,
    oversized.value
      ? {
          tone: 'warning',
          icon: 'i-ph-arrows-out-line-vertical',
          title: t('page.marketing.pages.preview.oversized'),
          description: t('page.marketing.pages.preview.oversized_hint'),
        }
      : null,
    snapshot.value && !snapshot.value.exact
      ? {
          tone: 'info',
          neutral: true,
          icon: 'i-ph-arrows-out-line-horizontal',
          title: t('page.marketing.pages.preview.approximate_layout', {
            layout: t(
              `page.marketing.pages.preview.layout_${snapshot.value.layout}`,
            ).toLowerCase(),
            width: layoutWidth.value,
          }),
          description: t(
            'page.marketing.pages.preview.approximate_layout_hint',
          ),
        }
      : null,
    overflowing.value
      ? {
          tone: 'info',
          neutral: true,
          icon: 'i-ph-arrows-horizontal',
          title: t('page.marketing.pages.preview.overflow'),
          description: t('page.marketing.pages.preview.overflow_hint', {
            width: measuredWidth.value,
          }),
        }
      : null,
  ]
  return candidates.find((candidate) => candidate !== null) ?? null
})

const statusLine = computed(() => {
  if (!snapshot.value) {
    return ''
  }
  const layoutLabel = t(
    `page.marketing.pages.preview.layout_${snapshot.value.layout}`,
  ).toLowerCase()
  return t('page.marketing.pages.preview.status_line', {
    date: formatShortDate(snapshot.value.capturedAt, locale.value),
    layout: layoutLabel,
    width: snapshot.value.viewport.width,
  })
})

const maskLine = computed(() =>
  t(
    props.website?.snapshotMaskText
      ? 'page.marketing.pages.preview.all_masked'
      : 'page.marketing.pages.preview.fields_masked',
  ),
)

// --- Most clicked -----------------------------------------------------------

const MOST_CLICKED = 5

interface ClickedElement {
  key: string
  selector: string
  weight: number
  text: string
  box: AnchorBox | undefined
}

/** The anchored elements with the most clicks, the backend's own cells summed. */
const mostClicked = computed<ClickedElement[]>(() => {
  const groups = new Map<string, ClickedElement>()
  for (const point of points.value) {
    if (!point.anchor) {
      continue
    }
    const key = anchorKey(point.anchor)
    const existing = groups.get(key)
    if (existing) {
      existing.weight += point.weight
      continue
    }
    const box = anchorBoxes.value.get(key)
    groups.set(key, {
      key,
      selector: point.anchor.selector,
      weight: point.weight,
      text: box?.text ?? '',
      box,
    })
  }
  return [...groups.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MOST_CLICKED)
})

/** Half a pin's footprint on screen, and the step that unstacks two pins. */
const PIN_HALF_WIDTH = 28
const PIN_HALF_HEIGHT = 11
const PIN_STEP = 22

interface Pin {
  key: string
  weight: number
  left: number
  top: number
}

/**
 * Count badges pinned on the hottest elements, in the surface's own pixels:
 * kept inside the surface (an element flush with the right edge would cut
 * its badge in half) and pushed down past the badges already placed.
 */
const pins = computed(() => {
  if (overlayMode.value !== 'clicks') {
    return []
  }
  const unit = 1 / scale.value
  const placed: Pin[] = []
  for (const element of mostClicked.value) {
    const box = element.box
    if (!box) {
      continue
    }
    const left = Math.min(
      Math.max(box.x + box.width, PIN_HALF_WIDTH * unit),
      layoutWidth.value - PIN_HALF_WIDTH * unit,
    )
    let top = Math.max(box.y, PIN_HALF_HEIGHT * unit)
    while (
      placed.some(
        (pin) =>
          Math.abs(pin.left - left) < 2 * PIN_HALF_WIDTH * unit &&
          Math.abs(pin.top - top) < PIN_STEP * unit,
      )
    ) {
      top += PIN_STEP * unit
    }
    placed.push({ key: element.key, weight: element.weight, left, top })
  }
  return placed
})

// --- Toolbar ------------------------------------------------------------------

const overlayItems = computed(() => [
  {
    value: 'clicks',
    label: t('page.marketing.pages.overlay.clicks'),
    icon: 'i-ph-cursor-click',
  },
  {
    value: 'scroll',
    label: t('page.marketing.pages.overlay.scroll'),
    icon: 'i-ph-caret-double-down',
  },
])

const layoutItems = computed(() =>
  LAYOUT_PRESETS.map((preset) => ({
    value: preset.width,
    label: '',
    icon: preset.icon,
  })),
)

/**
 * Names the icon-only layout segments: DmsSegmented renders an item's label
 * as its only text and has no per-item aria-label, so a screen reader would
 * read three unnamed radios. Set on the rendered buttons, in preset order.
 */
const layoutSwitch = ref<HTMLElement | null>(null)

watch(
  [layoutSwitch, locale],
  ([wrapper]) => {
    wrapper?.querySelectorAll('[role="radio"]').forEach((radio, index) => {
      const preset = LAYOUT_PRESETS[index]
      if (preset) {
        radio.setAttribute('aria-label', t(preset.labelKey))
        radio.setAttribute('title', t(preset.labelKey))
      }
    })
  },
  { flush: 'post' },
)

const moreItems = computed(() => [
  [
    {
      type: 'checkbox' as const,
      label: t('page.marketing.pages.preview.snapshots_enabled'),
      checked: snapshotsEnabled.value,
      onUpdateChecked: (value: boolean): void =>
        void updateSnapshotOptions({ snapshotsEnabled: value }),
    },
    {
      type: 'checkbox' as const,
      label: t('page.marketing.pages.preview.mask_text'),
      checked: props.website?.snapshotMaskText === true,
      disabled: !snapshotsEnabled.value,
      onUpdateChecked: (value: boolean): void =>
        void updateSnapshotOptions({ snapshotMaskText: value }),
    },
  ],
  ...(externalUrl.value
    ? [
        [
          {
            label: t('page.marketing.pages.preview.open_in_tab'),
            icon: 'i-ph-arrow-square-out',
            to: externalUrl.value,
            target: '_blank',
          },
        ],
      ]
    : []),
  [
    {
      label: t('page.marketing.pages.reset.page_button'),
      icon: 'i-ph-eraser',
      color: 'error' as const,
      onSelect: () => void resetPageHeatmap(),
    },
  ],
])

// --- Surface ----------------------------------------------------------------

/**
 * What the left cell draws. One empty state whose texts change with the
 * reason, never several swapped in turn: replacing one DmsEmptyState by
 * another landed the new one outside the cell.
 */
const surface = computed(() => {
  if (activeFailed.value) {
    return 'error'
  }
  if (snapshot.value && backdrop.value !== null) {
    return 'frame'
  }
  if (emptyState.value) {
    return 'empty'
  }
  if (snapshotsEnabled.value && !snapshotSettled.value) {
    return 'loading'
  }
  return 'no_backdrop'
})

const surfaceEmpty = computed(() => {
  if (surface.value === 'error') {
    return {
      variant: 'error' as const,
      icon: undefined,
      title: t('page.marketing.common.load_error'),
      description: undefined,
    }
  }
  if (surface.value === 'empty' && emptyState.value) {
    return {
      variant: undefined,
      icon:
        overlayMode.value === 'clicks'
          ? 'i-ph-cursor-click'
          : 'i-ph-caret-double-down',
      ...emptyState.value,
    }
  }
  return {
    variant: undefined,
    icon: 'i-ph-image-broken',
    title: t('page.marketing.pages.preview.no_backdrop'),
    description: t('page.marketing.pages.preview.no_backdrop_hint'),
  }
})
</script>

<template>
  <section class="dms-card flex min-w-0 flex-col overflow-hidden p-0">
    <!-- Toolbar -->
    <header
      class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3"
    >
      <div class="min-w-0 flex-1 basis-64">
        <p
          class="flex min-w-0 items-center gap-2 font-mono text-base font-semibold text-highlighted"
        >
          <span class="min-w-0 truncate" :title="props.path">
            {{ props.path }}
          </span>
          <UButton
            v-if="externalUrl"
            :to="externalUrl"
            target="_blank"
            icon="i-ph-arrow-square-out"
            size="xs"
            color="neutral"
            variant="ghost"
            class="shrink-0"
            :aria-label="t('page.marketing.pages.preview.open_in_tab')"
          />
        </p>
        <p class="flex flex-wrap gap-x-3 text-xs text-muted">
          <span v-if="props.pageviews !== undefined">
            <b class="font-mono text-highlighted">
              {{ formatNumber(props.pageviews, locale) }}
            </b>
            {{ t('page.marketing.pages.views_unit', props.pageviews) }}
          </span>
          <span>
            <b class="font-mono text-highlighted">
              {{ formatNumber(totalClicks, locale) }}
            </b>
            {{ t('page.marketing.pages.clicks_unit', totalClicks) }}
          </span>
          <span v-if="scrollDepth !== null">
            <b class="font-mono text-highlighted">
              {{ formatNumber(scrollViews, locale) }}
            </b>
            {{ t('page.marketing.pages.sampled_unit', scrollViews) }}
          </span>
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <DmsSegmented
          v-model="overlayMode"
          :items="overlayItems"
          size="xs"
          :aria-label="t('page.marketing.pages.overlay.label')"
        />
        <span ref="layoutSwitch" class="contents">
          <DmsSegmented
            v-model="layoutWidth"
            :items="layoutItems"
            size="xs"
            :aria-label="t('page.marketing.pages.preview.layout')"
          />
        </span>
        <UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
          <UButton
            icon="i-ph-dots-three"
            size="xs"
            color="neutral"
            variant="ghost"
            :loading="savingOptions || resetting"
            :aria-label="t('page.marketing.pages.preview.more')"
          />
        </UDropdownMenu>
      </div>
    </header>

    <!-- One status line, or the one strip that needs attention -->
    <div v-if="statusStrip" class="px-3 pt-3">
      <DmsBanner
        :tone="statusStrip.tone"
        size="sm"
        :icon="statusStrip.icon"
        :title="statusStrip.title"
        :description="statusStrip.description"
      >
        <template v-if="statusStrip.action" #actions>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :loading="savingOptions"
            :label="statusStrip.action.label"
            :to="statusStrip.action.to"
            @click="statusStrip.action.run?.()"
          />
        </template>
      </DmsBanner>
    </div>
    <p
      v-else-if="snapshot"
      class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-default px-4 py-2 text-xs text-muted"
    >
      <span class="flex items-center gap-1.5">
        <UIcon name="i-ph-camera" class="size-3.5 text-success" />
        {{ statusLine }}
      </span>
      <span class="text-dimmed">· {{ maskLine }}</span>
    </p>

    <div class="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_15rem]">
      <div class="min-w-0 p-3">
        <USkeleton
          v-if="surface === 'loading'"
          class="w-full rounded-lg"
          :style="{ height: `${PANE_HEIGHT}px` }"
        />

        <!-- Kept mounted across refetches: tearing it down would re-render the
             snapshot — and re-measure it — on every period change. -->
        <div v-else-if="surface === 'frame'" class="relative">
          <div
            ref="container"
            class="overflow-x-hidden overflow-y-scroll rounded-lg border border-default bg-elevated"
            :style="paneStyle"
          >
            <!-- A layout narrower than the pane keeps its width, centred. -->
            <div
              class="relative mx-auto overflow-hidden"
              :class="
                surfaceWidth < containerWidth ? 'ring-1 ring-accented' : ''
              "
              :style="{
                width: `${surfaceWidth}px`,
                height: `${scrolledHeight}px`,
              }"
            >
              <div
                class="absolute top-0 left-0"
                :style="{
                  width: `${layoutWidth}px`,
                  height: `${renderHeight}px`,
                  zoom: scale,
                }"
              >
                <!-- Inert on purpose: pointer-events none means no link, form or
                     hover state inside the snapshot can fire. The sandbox allows
                     same-origin and nothing else — no script, no form, no
                     navigation — which is what lets useSnapshotFrame read the
                     document while a capture that arrived through a public
                     endpoint stays inert. Hidden from assistive technology:
                     "Most clicked" is its readable alternative. -->
                <iframe
                  :key="frameKey"
                  ref="frame"
                  :srcdoc="frameDocument"
                  class="pointer-events-none absolute top-0 left-0 w-full border-0"
                  :style="{
                    height: `${frameHeight}px`,
                    colorScheme: snapshotScheme,
                    backgroundColor:
                      snapshotScheme === 'dark' ? DARK_CANVAS : LIGHT_CANVAS,
                  }"
                  sandbox="allow-same-origin"
                  scrolling="no"
                  referrerpolicy="no-referrer"
                  aria-hidden="true"
                  tabindex="-1"
                  inert
                  :title="props.path"
                />
                <DmsMarketingHeatmapCanvas
                  v-if="overlayMode === 'clicks'"
                  :points="drawnPoints"
                  :max-weight="maxWeight"
                  :width="overlayWidth"
                  :height="renderHeight"
                />
                <span
                  v-for="pin in pins"
                  :key="pin.key"
                  aria-hidden="true"
                  class="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-neutral-900/90 px-2 py-0.5 font-mono font-semibold text-white shadow"
                  :style="{
                    left: `${pin.left * scale}px`,
                    top: `${pin.top * scale}px`,
                    zoom: 1 / scale,
                    fontSize: '12px',
                  }"
                >
                  <span class="size-1.5 rounded-full bg-red-500" />
                  {{ formatNumber(pin.weight, locale) }}
                </span>
              </div>

              <!-- In the pane's scaled space, not the document's: depth only
                   varies vertically, and the labels must not shrink with the
                   page — see the component. -->
              <DmsMarketingScrollDepthOverlay
                v-if="overlayMode === 'scroll' && scrollViews > 0"
                :reached="scrollReached"
                :views="scrollViews"
                :height="scrolledHeight"
                :fold-ratio="scrollFoldRatio"
              />
            </div>
          </div>

          <!-- Outside the scrollport on purpose: inside, it is laid out at the
               top of the content and scrolls out of sight on a tall page. -->
          <div
            v-if="activeLoading"
            class="absolute inset-0 flex items-center justify-center rounded-lg bg-default/60"
          >
            <UIcon
              name="i-ph-circle-notch"
              class="size-6 animate-spin text-muted"
            />
          </div>
        </div>

        <!-- One empty state for every reason, in a plain wrapper: see `surface`. -->
        <div v-else>
          <DmsEmptyState
            :variant="surfaceEmpty.variant"
            :icon="surfaceEmpty.icon"
            :hatched="surface !== 'error'"
            :size="surface === 'error' ? 'sm' : undefined"
            :title="surfaceEmpty.title"
            :description="surfaceEmpty.description"
          >
            <template v-if="surface === 'error'" #actions>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-ph-arrow-clockwise"
                :label="t('page.marketing.common.retry')"
                @click="retryActive"
              />
            </template>
          </DmsEmptyState>
        </div>
      </div>

      <aside
        class="flex flex-col gap-4 border-t border-default p-4 xl:border-t-0 xl:border-l"
      >
        <template v-if="overlayMode === 'clicks'">
          <div class="flex flex-col gap-1.5">
            <DmsEyebrow :label="t('page.marketing.pages.density')" />
            <span
              class="h-2 rounded-full"
              :style="{ backgroundImage: heatLegendGradient() }"
            />
            <span class="flex justify-between text-[10px] text-dimmed">
              <span>{{ t('page.marketing.pages.density_few') }}</span>
              <span>{{ t('page.marketing.pages.density_many') }}</span>
            </span>
          </div>
          <div class="flex flex-col gap-2">
            <DmsEyebrow :label="t('page.marketing.pages.most_clicked')" />
            <p v-if="mostClicked.length === 0" class="text-xs text-muted">
              {{ t('page.marketing.pages.most_clicked_empty') }}
            </p>
            <ul v-else class="flex flex-col gap-2.5">
              <li
                v-for="element in mostClicked"
                :key="element.key"
                class="flex min-w-0 flex-col"
              >
                <span class="flex items-start justify-between gap-2">
                  <span
                    class="truncate text-[13px] font-medium text-highlighted"
                    :class="element.text ? '' : 'font-mono'"
                    :title="element.text || element.selector"
                  >
                    {{
                      element.text
                        ? t('page.marketing.pages.quoted', {
                            text: element.text,
                          })
                        : element.selector
                    }}
                  </span>
                  <span class="font-mono text-xs text-highlighted">
                    {{ formatNumber(element.weight, locale) }}
                  </span>
                </span>
                <span
                  v-if="element.text"
                  class="truncate font-mono text-[10px] text-dimmed"
                  :title="element.selector"
                >
                  {{ element.selector }}
                </span>
              </li>
            </ul>
          </div>
        </template>
        <div v-else class="flex flex-col gap-2">
          <DmsEyebrow :label="t('page.marketing.pages.scroll.legend_title')" />
          <span
            class="h-2 rounded-full"
            :style="{ backgroundImage: heatLegendGradient(true) }"
          />
          <span class="flex justify-between text-[10px] text-dimmed">
            <span>{{ t('page.marketing.pages.scroll.legend_all') }}</span>
            <span>{{ t('page.marketing.pages.scroll.legend_few') }}</span>
          </span>
          <span
            v-if="scrollViews > 0 && scrollFoldRatio > 0 && scrollFoldRatio < 1"
            class="flex items-center gap-2 text-xs text-muted"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full bg-default shadow ring-1 ring-default"
              aria-hidden="true"
            />
            <span class="h-px w-4 shrink-0 bg-current" aria-hidden="true" />
            {{ t('page.marketing.pages.scroll.fold_line') }}
          </span>
          <p v-if="scrollViews > 0" class="text-xs text-muted">
            {{
              t('page.marketing.pages.scroll.median', {
                depth: medianDepth,
              })
            }}
          </p>
          <p class="text-xs text-dimmed">
            {{ t('page.marketing.pages.scroll.lines_hint') }}
          </p>
        </div>
        <div v-if="usedIn && usedIn.length > 0" class="flex flex-col gap-2">
          <DmsEyebrow :label="t('page.marketing.pages.used_in')" />
          <DmsAutoLink
            v-for="funnel in usedIn"
            :key="funnel._id"
            :to="funnelLink(funnel._id)"
            class="flex items-center gap-2 rounded-lg border border-default p-2.5 transition-colors hover:border-primary"
          >
            <DmsIconWell icon="i-ph-funnel" size="sm" tone="primary" />
            <span class="truncate text-sm font-medium text-highlighted">
              {{ funnel.name }}
            </span>
          </DmsAutoLink>
        </div>
        <p
          v-if="overlayMode === 'clicks'"
          class="mt-auto flex gap-1.5 text-xs text-dimmed"
        >
          <UIcon name="i-ph-crosshair" class="mt-0.5 size-3.5 shrink-0" />
          {{ t('page.marketing.pages.anchoring_note') }}
        </p>
      </aside>
    </div>
  </section>
</template>
