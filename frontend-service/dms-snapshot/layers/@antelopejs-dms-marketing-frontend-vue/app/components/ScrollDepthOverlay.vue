<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '#dms/frontend-module'
import { heatColorAt } from '../utils/heatmapPalette'

/**
 * Scroll-depth overlay of one tracked page: a vertical gradient of how many
 * measured views saw each band of the page, reach marks at fixed shares, and
 * a readout following the pointer.
 *
 * Drawn in the pane's scaled space as a sibling of the scaled surface, not
 * inside it: depth only varies vertically, so fractions of the pane's height
 * are fractions of the document — and the labels keep their font size at
 * every zoom instead of shrinking with the page.
 *
 * `foldRatio` is where depth 0 sits. A recorded depth is a fraction of the
 * visitor's *scrollable range*, whose zero already has the first viewport on
 * screen; the probe viewport stands in for visitor viewports this surface
 * cannot know. Bands are trustworthy, pixels are not. Above the fold the
 * shade is flat — every measured view starts there.
 */
const props = defineProps<{
  /** reached[d] = views whose max depth is ≥ d percent, d = 0..100. */
  reached: number[]
  /** Sampled views with a measured depth — the denominator of every share. */
  views: number
  /** Height of the overlay in the pane's own pixels (already scaled). */
  height: number
  /** 0-1 fraction of the height where depth 0 sits (the first viewport). */
  foldRatio: number
}>()

const DEPTH_SCALE = 100
/** Gradient resolution; the distribution is monotonic, so 5% steps lose
 * nothing a reader could see. */
const GRADIENT_STEP = 5
const OVERLAY_ALPHA = 0.35
/** Shares worth a marked line, labelled with the share alone so the chips
 * cover as little of the page as possible; the aside explains them and the
 * pointer readout says the full sentence. */
const REACH_MARKS = [75, 50, 25]

const { t } = useI18n()

function reachAt(depth: number): number {
  if (props.views <= 0) {
    return 0
  }
  const clamped = Math.min(Math.max(depth, 0), DEPTH_SCALE)
  return (props.reached[clamped] ?? 0) / props.views
}

/** Depth percent → 0-1 fraction of the drawn height. */
function yRatio(depth: number): number {
  return props.foldRatio + (depth / DEPTH_SCALE) * (1 - props.foldRatio)
}

const gradient = computed(() => {
  const colorFor = (fraction: number) => heatColorAt(fraction, OVERLAY_ALPHA)
  const stops = [`${colorFor(1)} 0%`]
  for (let depth = 0; depth <= DEPTH_SCALE; depth += GRADIENT_STEP) {
    stops.push(
      `${colorFor(reachAt(depth))} ${(yRatio(depth) * 100).toFixed(2)}%`,
    )
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`
})

/** Deepest point at least `percent`% of the measured views got to. */
function depthReachedBy(percent: number): number {
  for (let depth = DEPTH_SCALE; depth >= 0; depth--) {
    if (reachAt(depth) >= percent / DEPTH_SCALE) {
      return depth
    }
  }
  return 0
}

const marks = computed(() => {
  const placed: Array<{ percent: number; y: number }> = []
  for (const percent of REACH_MARKS) {
    const y = yRatio(depthReachedBy(percent)) * props.height
    // Collapsed shares (everyone stops at one depth) would stack identical
    // lines; the strongest claim wins.
    if (placed.every((mark) => Math.abs(mark.y - y) > 1)) {
      placed.push({ percent, y })
    }
  }
  return placed
})

const foldY = computed(() => props.foldRatio * props.height)
const showFold = computed(() => props.foldRatio > 0 && props.foldRatio < 1)

const hover = ref<{ y: number; percent: number } | null>(null)

function onPointerMove(event: PointerEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (rect.height <= 0 || props.foldRatio >= 1) {
    return
  }
  const ratio = Math.min(
    Math.max((event.clientY - rect.top) / rect.height, 0),
    1,
  )
  const depth =
    ratio <= props.foldRatio
      ? 0
      : Math.round(
          ((ratio - props.foldRatio) / (1 - props.foldRatio)) * DEPTH_SCALE,
        )
  hover.value = {
    y: ratio * props.height,
    percent: Math.round(reachAt(depth) * 100),
  }
}
</script>

<template>
  <div
    class="absolute inset-0"
    @pointermove="onPointerMove"
    @pointerleave="hover = null"
  >
    <div
      class="pointer-events-none absolute inset-0"
      :style="{ background: gradient }"
    />

    <!-- Named in the legend, not on the page: a label on the line sat on
         whatever the first screen ends with (a button, a price). -->
    <div
      v-if="showFold"
      class="pointer-events-none absolute inset-x-0"
      :aria-label="t('page.marketing.pages.scroll.fold_line')"
      role="img"
      :style="{
        top: `${foldY}px`,
        borderTop: '1px solid rgba(255, 255, 255, 0.55)',
      }"
    >
      <span
        class="absolute left-0 top-0 h-2 w-2 -translate-y-1/2 rounded-full bg-default shadow ring-1 ring-white/70"
      />
    </div>

    <div
      v-for="mark in marks"
      :key="mark.percent"
      class="pointer-events-none absolute inset-x-0"
      :style="{
        top: `${mark.y}px`,
        borderTop: '2px dashed rgba(255, 255, 255, 0.85)',
        filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4))',
      }"
    >
      <span
        class="absolute right-2 top-0 -translate-y-1/2 rounded-full bg-default/90 px-1.5 py-0.5 font-mono text-[11px] font-medium text-highlighted shadow"
        :title="
          t('page.marketing.pages.scroll.reach_line', { percent: mark.percent })
        "
      >
        {{ t('page.marketing.pages.scroll.mark', { percent: mark.percent }) }}
      </span>
    </div>

    <div
      v-if="hover"
      class="pointer-events-none absolute inset-x-0"
      :style="{
        top: `${hover.y}px`,
        borderTop: '1px solid rgba(255, 255, 255, 0.95)',
      }"
    >
      <span
        class="absolute left-2 top-0 -translate-y-1/2 rounded-full bg-default/90 px-2 py-0.5 text-xs font-medium text-highlighted shadow"
      >
        {{
          t('page.marketing.pages.scroll.reach_line', {
            percent: hover.percent,
          })
        }}
      </span>
    </div>
  </div>
</template>
