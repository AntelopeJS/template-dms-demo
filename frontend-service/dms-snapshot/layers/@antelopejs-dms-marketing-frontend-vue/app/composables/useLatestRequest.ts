import { ref, type Ref } from 'vue'

/**
 * A read whose answers may land out of order, resolved so that only the
 * newest one is ever shown.
 *
 * Every surface of this module refetches on a selection, a period and
 * sometimes a search box, and those fetches are not ordered: a slow answer for
 * the site, page or funnel the user just left would otherwise repaint over the
 * one on screen. The rule is the same everywhere — stamp each run, and let a
 * run write only while it is still the latest — which is exactly what this
 * owns instead of leaving it to be re-derived per component.
 *
 * `fetcher` returns `null` when there is nothing to ask for (no selection yet,
 * or server-side, where there is no session to authenticate with). That is a
 * settled empty state, not a failure and not a load: it clears the data and
 * leaves nothing spinning.
 */
export interface LatestRequest<T> {
  /** Newest answer, or null before the first one and after any failure. */
  data: Ref<T | null>
  loading: Ref<boolean>
  failed: Ref<boolean>
  /** Cause of the last failure, for callers that surface a message. */
  error: Ref<unknown>
  /**
   * False until a run has settled. This is what tells "not asked yet" from
   * "asked, and there is nothing" — a component that renders an empty state
   * on the former flashes it before its first fetch resolves.
   */
  settled: Ref<boolean>
  run: () => Promise<void>
}

export function useLatestRequest<T>(
  fetcher: () => Promise<T> | null,
): LatestRequest<T> {
  const data = ref(null) as Ref<T | null>
  const loading = ref(false)
  const failed = ref(false)
  const error = ref<unknown>(null)
  const settled = ref(false)

  let latest = 0

  async function run(): Promise<void> {
    const request = ++latest
    // Cleared before the guard below, so a retry with nothing to fetch cannot
    // leave a stale error on screen.
    failed.value = false
    error.value = null

    // Called synchronously: the fetcher reads the selection as it is now, not
    // as it will be once the previous request resolves.
    const pending = fetcher()
    if (!pending) {
      data.value = null
      loading.value = false
      settled.value = true
      return
    }

    loading.value = true
    try {
      const result = await pending
      if (request !== latest) {
        return
      }
      data.value = result
    } catch (cause) {
      if (request !== latest) {
        return
      }
      failed.value = true
      error.value = cause
      data.value = null
    } finally {
      // A superseded run owns none of the shared state — not even the flag
      // that says the newest one is still in flight.
      if (request === latest) {
        loading.value = false
        settled.value = true
      }
    }
  }

  return { data, loading, failed, error, settled, run }
}
