import { computed } from 'vue'
import { parseRouteRef } from '../utils/http'

/** The request the tester replays (`?replay=<id>`, `RouteTester.vue`). */
const REPLAY_QUERY_KEY = 'replay'

export interface SelectOptions {
  /**
   * Replace the history entry instead of adding one: for a selection the
   * user did not ask for (the route a bare `/routes` opens on) and for the
   * keyboard, so Back leaves the page instead of walking every route seen.
   */
  replace?: boolean
}

/**
 * The route the Routes page shows, as `?route=METHOD%20/path` in the URL: a
 * link, a reload or the back button land on the same route, and every block
 * of the page reads the same value.
 */
export function useRouteSelection(queryKey = 'route') {
  const route = useDmsRoute()
  const router = useDmsRouter()

  const ref = computed<string | null>(() => {
    const value = route.query[queryKey]
    return typeof value === 'string' && value ? value : null
  })
  const parsed = computed(() => parseRouteRef(ref.value))

  async function select(next: string | null, options: SelectOptions = {}) {
    if (next === ref.value) return
    const query = { ...route.query } as Record<string, string | string[]>
    // A replayed request belongs to the route it was sent to: another route
    // opens its tester blank.
    delete query[REPLAY_QUERY_KEY]
    if (next) query[queryKey] = next
    else delete query[queryKey]
    await (options.replace ? router.replace({ query }) : router.push({ query }))
  }

  return { ref, parsed, select }
}
