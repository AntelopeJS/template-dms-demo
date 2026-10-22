const MAX_SUGGESTION_DISTANCE_RATIO = 0.4

/** Edit distance between two strings (insertions, deletions, substitutions). */
export function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[b.length]
}

/**
 * The candidate a mistyped search most likely meant: compared segment by
 * segment, so "refnd" finds `/api/orders/:id/refund`. Null when nothing is
 * close enough to be a typo.
 */
export function closestMatch(
  search: string,
  candidates: string[],
): string | null {
  const needle = search.toLowerCase()
  let best: { candidate: string; distance: number } | null = null
  for (const candidate of candidates) {
    const parts = [candidate, ...candidate.split('/')].filter(Boolean)
    for (const part of parts) {
      const distance = editDistance(needle, part.toLowerCase())
      if (!best || distance < best.distance) best = { candidate, distance }
    }
  }
  if (!best) return null
  return best.distance <=
    Math.max(1, Math.round(needle.length * MAX_SUGGESTION_DISTANCE_RATIO))
    ? best.candidate
    : null
}
