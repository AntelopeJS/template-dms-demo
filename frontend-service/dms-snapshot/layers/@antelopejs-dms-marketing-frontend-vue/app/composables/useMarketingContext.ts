import { computed, inject, type ComputedRef, type InjectionKey } from 'vue'

/** `imported`: data, but only from an import — nothing proves the tag collects. */
export type WebsiteState = 'live' | 'imported' | 'waiting' | 'paused'

export interface ContextWebsite {
  id: string
  name: string
  domain: string
  state: WebsiteState
  lastActivityAt: number | null
}

export interface MarketingContextPayload {
  websites: ContextWebsite[]
  selectedId: string | null
}

/** What the context container hands the blocks it wraps. */
export interface MarketingContextState {
  websites: ComputedRef<ContextWebsite[]>
  selected: ComputedRef<ContextWebsite | null>
  select: (id: string) => Promise<void>
  reload: () => Promise<void>
}

export const MARKETING_CONTEXT_KEY: InjectionKey<MarketingContextState> =
  Symbol('dms-marketing-context')

/**
 * The context of the page the block sits on. Outside a context container (a
 * block dropped on another page) the website is unknown and the routes fall
 * back to the caller's own selection. The period is the DMS period scope's
 * (`usePeriodScope`), which the bar's selector publishes.
 */
export function useMarketingContext(): MarketingContextState {
  return inject(MARKETING_CONTEXT_KEY, () => detachedContext(), true)
}

function detachedContext(): MarketingContextState {
  return {
    websites: computed(() => []),
    selected: computed(() => null),
    select: async () => {},
    reload: async () => {},
  }
}
