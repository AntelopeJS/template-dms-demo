import {
  defineDmsPlugin,
  useDmsRuntimeConfig,
  useDmsUserSession,
} from '#dms/frontend-module'
import { useMarketingApi } from '../composables/useMarketingApi'
import {
  applyDashboardTracker,
  type DashboardTrackingOptions,
  followDashboardSession,
} from '../utils/dashboard-tracker'
import { trackerUrl } from '../utils/snippet'

/**
 * Loads the tracker on every dashboard page while someone is signed in, on
 * the website of their workspace. Registered by `dms.frontend.ts` only when
 * the backend enables `dashboardTracking`; client-only, since the tag is the
 * browser's business and the server render has no session to follow.
 */
export function dashboardTrackingPlugin(options: DashboardTrackingOptions) {
  return defineDmsPlugin(() => {
    const { loggedIn, session } = useDmsUserSession()
    const config = useDmsRuntimeConfig()
    const api = useMarketingApi()
    // The public backend URL, where client sites load the tracker from too.
    const src = trackerUrl(
      String(
        (config.public as { dms?: { baseURL?: string } }).dms?.baseURL ?? '',
      ),
    )

    followDashboardSession({
      workspace: () =>
        loggedIn.value ? (session.value?.activeTenantId ?? '') : null,
      provision: async () => (await api.dashboardTracking()).websiteId,
      apply: (websiteId) =>
        applyDashboardTracker(document, {
          src,
          websiteId,
          excludePaths: options.excludePaths,
        }),
    })
  })
}
