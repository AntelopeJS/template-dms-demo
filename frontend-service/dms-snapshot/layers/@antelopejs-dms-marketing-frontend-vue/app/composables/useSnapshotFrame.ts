import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * Geometry of a page snapshot rendered in a same-origin, script-less frame.
 *
 * The frame is `srcdoc`, sandboxed without scripts and with the console's
 * origin, so its document is ours to read: no handshake, no timeout, no
 * silence to diagnose. The size is still taken from at most ONE reading,
 * with the frame pinned at a probe viewport until then: sizing the frame
 * from a reading taken through it runs away, every `100vh` section growing
 * one tick at a time, exactly as it would with a live page. Once published,
 * later growth is ignored until `reset()`.
 */

/** Fallback document height when nothing measured it. */
export const DEFAULT_RENDER_HEIGHT = 3200

/** Floor on any render height, measured or typed. */
export const MIN_RENDER_HEIGHT = 400

/** Ceilings on the drawn surface: the canvas allocates width × height × 4 B. */
export const MAX_RENDER_HEIGHT = 20000
export const MAX_RENDER_WIDTH = 4000

/** Post-load growth worth waiting for: web fonts swapping in. */
const SETTLE_MS = 300

const SRCDOC_URL = 'about:srcdoc'

/**
 * `off` — no frame mounted.
 * `pending` — a frame is up, nothing published yet; it stays at probe size.
 * `measured` — a size was published; geometry comes from the snapshot.
 */
export type SnapshotTier = 'off' | 'pending' | 'measured'

/** What the overlay asks the snapshot to locate for it. */
export interface AnchorRequest {
  selector: string
  nth: number
}

/** Box of one anchor, in the snapshot document's own coordinates. */
export interface AnchorBox extends AnchorRequest {
  x: number
  y: number
  width: number
  height: number
  /** What the element reads, for the "Most clicked" list; empty on an image. */
  text: string
}

const ANCHOR_TEXT_LENGTH = 40

function readableText(element: Element): string {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  // An image, an icon or a picture reads through its own alternative, or the
  // one of the image inside it.
  const label =
    text ||
    element.getAttribute('aria-label') ||
    element.getAttribute('alt') ||
    element.getAttribute('title') ||
    element.querySelector('img[alt]')?.getAttribute('alt') ||
    element.querySelector('svg title')?.textContent?.trim() ||
    ''
  return label.length > ANCHOR_TEXT_LENGTH
    ? `${label.slice(0, ANCHOR_TEXT_LENGTH - 1)}…`
    : label
}

export function useSnapshotFrame(frame: Ref<HTMLIFrameElement | null>) {
  /** Published size — the caller may size the frame from this, once. */
  const measuredWidth = ref<number | null>(null)
  const measuredHeight = ref<number | null>(null)

  /** Published or given up on: no further reading may be taken. */
  let closed = false
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let watchedFrame: HTMLIFrameElement | null = null

  function clearTimer(): void {
    if (settleTimer !== null) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
  }

  /** The srcdoc document, never the blank one a fresh frame starts on. */
  function frameDocument(): Document | null {
    const doc = frame.value?.contentDocument ?? null
    return doc && doc.URL === SRCDOC_URL ? doc : null
  }

  function publish(): void {
    const doc = frameDocument()
    if (closed || !doc) {
      return
    }
    closed = true
    clearTimer()
    const root = doc.documentElement
    // Reported as measured, not clamped: a document too large to draw is a
    // decision for the caller, and silently shrinking it here would misplace
    // every click by the ratio it was shrunk.
    measuredWidth.value = Math.max(root.scrollWidth, 1)
    measuredHeight.value = Math.max(root.scrollHeight, MIN_RENDER_HEIGHT)
  }

  function onFrameLoad(): void {
    const doc = frameDocument()
    if (!doc || closed) {
      return
    }
    void (doc.fonts?.ready ?? Promise.resolve()).then(() => {
      if (closed) {
        return
      }
      clearTimer()
      settleTimer = setTimeout(publish, SETTLE_MS)
    })
  }

  /**
   * Stop reading without publishing. The caller uses this when it resizes
   * the frame by hand (a typed height): from then on every reading measures
   * that layout, not the snapshot's.
   */
  function close(): void {
    closed = true
    clearTimer()
  }

  /** Start over: forget the size and wait for the frame to load. */
  function reset(): void {
    clearTimer()
    closed = false
    measuredWidth.value = null
    measuredHeight.value = null

    watchedFrame?.removeEventListener('load', onFrameLoad)
    watchedFrame = frame.value
    watchedFrame?.addEventListener('load', onFrameLoad)
    if (frameDocument()?.readyState === 'complete') {
      onFrameLoad()
    }
  }

  /**
   * Where a set of anchors sits in the snapshot. `nth` is strict: a document
   * that no longer has that match must not project the click onto a sibling
   * of the same selector — no box means the caller keeps the click's
   * document fractions. Read after the frame has settled at its final size;
   * boxes taken while it is being resized measure the wrong layout.
   */
  function measureAnchors(anchors: AnchorRequest[]): AnchorBox[] {
    const doc = frameDocument()
    const view = doc?.defaultView
    if (!doc || !view) {
      return []
    }
    const boxes: AnchorBox[] = []
    for (const anchor of anchors) {
      let matches: NodeListOf<Element>
      try {
        matches = doc.querySelectorAll(anchor.selector)
      } catch {
        continue
      }
      const element = matches[anchor.nth]
      const box = element?.getBoundingClientRect()
      if (!element || !box || box.width <= 0 || box.height <= 0) {
        continue
      }
      boxes.push({
        ...anchor,
        x: box.left + view.scrollX,
        y: box.top + view.scrollY,
        width: box.width,
        height: box.height,
        text: readableText(element),
      })
    }
    return boxes
  }

  onBeforeUnmount(() => {
    watchedFrame?.removeEventListener('load', onFrameLoad)
    watchedFrame = null
    clearTimer()
  })

  // A new frame is a new reading: the ref is only set once the iframe is
  // actually rendered, which the caller does conditionally and keyed.
  watch(frame, reset, { immediate: true })

  const tier = computed<SnapshotTier>(() => {
    if (!frame.value) {
      return 'off'
    }
    return measuredHeight.value !== null ? 'measured' : 'pending'
  })

  return { measuredWidth, measuredHeight, tier, reset, close, measureAnchors }
}
