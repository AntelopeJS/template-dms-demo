<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { MarketingHeatmapPoint } from '../composables/useMarketingApi'
import { HEAT_STOPS, heatRgba } from '../utils/heatmapPalette'

/**
 * Dependency-free heatmap renderer: points are drawn as radial alpha
 * gradients on an offscreen grayscale pass, then the alpha channel is mapped
 * through a color palette (classic heatmap.js technique, ~none of its bytes).
 * Coordinates are 0-1, relative to the drawn surface.
 *
 * `width`/`height` are CSS pixels as much as they are the backing store: the
 * element sizes itself from them. Letting the parent's box decide instead
 * would silently rescale x and y — a document wider than its container would
 * have every click squeezed leftwards, and the round blobs would render as
 * ellipses. The caller positions this; it does not stretch it.
 */
const props = defineProps<{
  points: MarketingHeatmapPoint[]
  maxWeight: number
  width: number
  height: number
}>()

const POINT_RADIUS = 28
// About 60% at the densest spot: the button under a hot spot stays readable.
const MAX_RENDER_ALPHA = 150
/** Floor on a point's intensity so single clicks stay visible. */
const MIN_POINT_ALPHA = 0.08
/** Flat opacity boost applied when colorising, capped at MAX_RENDER_ALPHA. */
const ALPHA_BOOST = 40
const PALETTE_SIZE = 256

const canvasRef = ref<HTMLCanvasElement | null>(null)

function buildPalette(): Uint8ClampedArray | null {
  const strip = document.createElement('canvas')
  strip.width = PALETTE_SIZE
  strip.height = 1
  const ctx = strip.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return null
  }
  const gradient = ctx.createLinearGradient(0, 0, PALETTE_SIZE, 0)
  for (const [stop, rgb] of HEAT_STOPS) {
    gradient.addColorStop(stop, heatRgba(rgb, 1))
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, PALETTE_SIZE, 1)
  return ctx.getImageData(0, 0, PALETTE_SIZE, 1).data
}

function drawIntensity(ctx: CanvasRenderingContext2D): void {
  const reference = Math.max(props.maxWeight, 1)
  for (const point of props.points) {
    const px = point.x * props.width
    const py = point.y * props.height
    const alpha = Math.max(point.weight / reference, MIN_POINT_ALPHA)
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, POINT_RADIUS)
    gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(
      px - POINT_RADIUS,
      py - POINT_RADIUS,
      POINT_RADIUS * 2,
      POINT_RADIUS * 2,
    )
  }
}

function colorize(ctx: CanvasRenderingContext2D): void {
  const palette = buildPalette()
  if (!palette) {
    return
  }
  const image = ctx.getImageData(0, 0, props.width, props.height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (alpha === 0) {
      continue
    }
    const offset = Math.min(alpha, PALETTE_SIZE - 1) * 4
    data[i] = palette[offset]
    data[i + 1] = palette[offset + 1]
    data[i + 2] = palette[offset + 2]
    data[i + 3] = Math.min(alpha + ALPHA_BOOST, MAX_RENDER_ALPHA)
  }
  ctx.putImageData(image, 0, 0)
}

function render(): void {
  const canvas = canvasRef.value
  if (!canvas || props.width <= 0 || props.height <= 0) {
    return
  }
  canvas.width = props.width
  canvas.height = props.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return
  }
  ctx.clearRect(0, 0, props.width, props.height)
  if (props.points.length === 0) {
    return
  }
  drawIntensity(ctx)
  colorize(ctx)
}

watch(() => [props.points, props.width, props.height], render, { deep: true })
onMounted(render)
</script>

<template>
  <canvas
    ref="canvasRef"
    aria-hidden="true"
    class="pointer-events-none absolute left-0 top-0"
    :style="{ width: `${props.width}px`, height: `${props.height}px` }"
  />
</template>
