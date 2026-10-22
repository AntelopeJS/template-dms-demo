/**
 * Viewport-relative units of a snapshot, rewritten to the pixels they
 * resolved to in the visitor's viewport.
 *
 * The snapshot frame is as tall as the whole document, so inside it `100vh`
 * is the document height, not a screen: every `min-height: 70vh` section
 * grows to 70 % of the page and the rest is pushed past the frame's edge.
 * No frame can be told otherwise; the stylesheet can. Only declaration
 * values are rewritten — a Tailwind arbitrary value puts `100vh` in the
 * selector too (`.h-\[100vh\]`), and rewriting it there would orphan the
 * rule — and a colon escaped with a backslash (`.md\:h-full`) is a selector
 * character, not the start of a value.
 *
 * Horizontal units are left alone: the frame is laid out at the chosen
 * width, so `vw` already means what it should.
 */

export interface SnapshotViewport {
  width: number
  height: number
}

const VIEWPORT_UNIT =
  /(-?(?:\d+\.?\d*|\.\d+))(dvh|svh|lvh|vh|vmin|vmax)(?![\w-])/g
const DECLARATION_VALUE = /((?<!\\):)([^;{}]*)/g
const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi
const STYLE_ATTRIBUTE = /(\sstyle=")([^"]*)(")/gi

function pixelsOf(
  amount: string,
  unit: string,
  viewport: SnapshotViewport,
): number {
  const base = unit.endsWith('vh')
    ? viewport.height
    : unit === 'vmin'
      ? Math.min(viewport.width, viewport.height)
      : Math.max(viewport.width, viewport.height)
  return Math.round(Number.parseFloat(amount) * base) / 100
}

function rewriteValue(value: string, viewport: SnapshotViewport): string {
  return value.replace(
    VIEWPORT_UNIT,
    (_match, amount: string, unit: string) =>
      `${pixelsOf(amount, unit, viewport)}px`,
  )
}

function rewriteDeclarations(css: string, viewport: SnapshotViewport): string {
  return css.replace(
    DECLARATION_VALUE,
    (_match, colon: string, value: string) =>
      colon + rewriteValue(value, viewport),
  )
}

export function rewriteViewportUnits(
  html: string,
  viewport: SnapshotViewport,
): string {
  return html
    .replace(
      STYLE_BLOCK,
      (_match, open: string, css: string, close: string) =>
        open + rewriteDeclarations(css, viewport) + close,
    )
    .replace(
      STYLE_ATTRIBUTE,
      (_match, open: string, css: string, close: string) =>
        open + rewriteDeclarations(css, viewport) + close,
    )
}
