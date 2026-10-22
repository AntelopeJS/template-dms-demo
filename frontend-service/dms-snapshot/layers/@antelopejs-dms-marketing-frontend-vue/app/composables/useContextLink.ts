import { useDmsRoute } from '#dms/frontend-module'
import { PERIOD_SCOPE } from '../constants'
import { withWebsite } from './useMarketingRoutes'

/**
 * A link out of the current page, in its context: the website the context
 * bar keeps in the page URL ({@link withWebsite}) and the period selector's
 * keys (the DMS `withPeriodQuery`), what the link names itself winning.
 */
export function useContextLink(): (link: string) => string {
  const route = useDmsRoute()
  return (link) => {
    const query = route.query as Record<string, unknown>
    return withPeriodQuery(withWebsite(link, query), query, PERIOD_SCOPE)
  }
}
