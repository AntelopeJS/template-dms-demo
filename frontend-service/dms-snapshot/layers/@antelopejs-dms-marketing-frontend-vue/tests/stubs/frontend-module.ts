/**
 * Stand-in for the loader-provided `#dms/frontend-module` alias.
 *
 * The real module only exists inside the Vue workspace the DMS frontend
 * loader generates; these tests run the module's own sources directly, so the
 * few SDK helpers they reach are stubbed with the same shapes.
 */
import type { Component, Plugin } from 'vue'

export type DmsPluginSetup = (context: unknown) => void | Promise<void>

export interface DmsFrontendSdk {
  options: { public: Record<string, unknown> }
  registerComponent: (name: string, component: Component) => void
  registerPage: (name: string, component: Component) => void
  registerDynamicPage: (name: string, component: Component) => void
  registerLayout: (name: string, component: Component) => void
  registerErrorPage: (component: Component) => void
  registerPlugin: (
    setup: DmsPluginSetup,
    options?: { clientOnly?: boolean },
  ) => void
  registerMiddleware: (name: string, handler: unknown) => void
  provide: (key: string, value: unknown) => void
  use: (plugin: Plugin) => void
}

export interface DmsFrontendModule {
  componentPrefix?: string
  setup(sdk: DmsFrontendSdk): void | Promise<void>
}

export function defineDmsPlugin(setup: DmsPluginSetup): DmsPluginSetup {
  return setup
}

export function useI18n(): {
  t: (key: string) => string
  te: () => boolean
  locale: { value: string }
} {
  return { t: (key: string) => key, te: () => false, locale: { value: 'en' } }
}

export function useDmsRoute(): { query: Record<string, string>; path: string } {
  return { query: {}, path: '/' }
}

export function useDmsRouter(): {
  replace: () => Promise<void>
  push: () => Promise<void>
} {
  return { replace: async () => {}, push: async () => {} }
}

export function useDmsRuntimeConfig(): { public: Record<string, unknown> } {
  return { public: {} }
}

export function resolveDmsComponent(): Component | undefined {
  return undefined
}

export function useDmsCookie<T>(
  _name: string,
  options: { default: () => T },
): { value: T } {
  return { value: options.default() }
}

export function useDmsUserSession(): {
  loggedIn: { value: boolean }
  session: { value: { activeTenantId?: string } | null }
} {
  return { loggedIn: { value: false }, session: { value: null } }
}
