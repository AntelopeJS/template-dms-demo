/**
 * The tag that measures the dashboard itself, when the backend enables
 * `dashboardTracking`: the same tracker client sites embed, inserted by the
 * module instead of pasted. It is kept and retargeted, never reinserted: the
 * tracker follows its `data-website-id` (see static/tracker.js), and a
 * second copy would only be refused.
 */
import { watch, type WatchStopHandle } from 'vue'
import { MODULE_CONFIG_KEY } from '../constants'

export const DASHBOARD_TRACKER_ELEMENT_ID = 'dms-marketing-dashboard-tracker'

/** What the module's public options carry when the backend turns it on. */
export interface DashboardTrackingOptions {
  /** Route patterns left uncounted, the sign-in pages included. */
  excludePaths: string[]
}

/**
 * The dashboard tag's options among the module's public ones, or null while
 * the backend leaves it off — the default, under which the module registers
 * nothing for it.
 */
export function dashboardTrackingOptions(
  publicOptions: Record<string, unknown>,
): DashboardTrackingOptions | null {
  const tracking = (
    publicOptions[MODULE_CONFIG_KEY] as
      { dashboardTracking?: { excludePaths?: unknown } } | undefined
  )?.dashboardTracking
  if (!tracking || typeof tracking !== 'object') {
    return null
  }
  const excludePaths = Array.isArray(tracking.excludePaths)
    ? tracking.excludePaths.filter(
        (path): path is string => typeof path === 'string',
      )
    : []
  return { excludePaths }
}

export interface DashboardTrackerTag {
  src: string
  /** Null pauses collection without removing the tracker. */
  websiteId: string | null
  excludePaths: string[]
}

/** The DOM this helper touches, so it runs against a stand-in in tests. */
type TagDocument = Pick<Document, 'getElementById' | 'createElement'> & {
  head: Pick<HTMLHeadElement, 'appendChild'>
}

/**
 * Points the tag at `websiteId`, inserting it the first time there is one.
 * A null id before any insertion inserts nothing: a dashboard nobody signed
 * into never loads the tracker.
 */
export function applyDashboardTracker(
  doc: TagDocument,
  tag: DashboardTrackerTag,
): void {
  const existing = doc.getElementById(DASHBOARD_TRACKER_ELEMENT_ID)
  if (existing) {
    if (tag.websiteId) {
      existing.setAttribute('data-website-id', tag.websiteId)
    } else {
      existing.removeAttribute('data-website-id')
    }
    return
  }
  if (!tag.websiteId) {
    return
  }
  const script = doc.createElement('script')
  script.id = DASHBOARD_TRACKER_ELEMENT_ID
  script.async = true
  script.src = tag.src
  script.setAttribute('data-website-id', tag.websiteId)
  if (tag.excludePaths.length > 0) {
    script.setAttribute('data-exclude-paths', tag.excludePaths.join(','))
  }
  doc.head.appendChild(script)
}

export interface DashboardSessionBinding {
  /** The signed-in workspace (tenant id, '' when none is named), or null
   * while nobody is signed in. */
  workspace: () => string | null
  /** The website of the signed-in workspace, provisioned on first use. */
  provision: () => Promise<string>
  apply: (websiteId: string | null) => void
}

/**
 * Keeps the tag on the website of whoever is signed in. Any change pauses it
 * synchronously — before the navigation that follows a sign-out or a
 * workspace switch — so no page of one workspace reaches another's site;
 * the new website is set once the backend answers, if nothing changed
 * meanwhile. A failure leaves it paused: measuring the dashboard must never
 * get in its way.
 */
export function followDashboardSession(
  binding: DashboardSessionBinding,
): WatchStopHandle {
  let generation = 0
  return watch(
    binding.workspace,
    async (workspace) => {
      const current = ++generation
      binding.apply(null)
      if (workspace === null) {
        return
      }
      let websiteId: string
      try {
        websiteId = await binding.provision()
      } catch {
        return
      }
      if (current === generation) {
        binding.apply(websiteId)
      }
    },
    { immediate: true, flush: 'sync' },
  )
}
