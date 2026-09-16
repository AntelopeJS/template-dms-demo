interface QuickActionGlobals {
  QUICK_ACTION_QUERY_KEY?: string;
  QUICK_ACTION_ADD?: string;
  QUICK_ACTION_COMPONENT_KEY?: string;
}

// DMS 0.5's TableView references these auto-imports without emitting their
// runtime imports. Expose them until DMS ships the imports explicitly.
const quickActionGlobals = globalThis as typeof globalThis & QuickActionGlobals;

quickActionGlobals.QUICK_ACTION_QUERY_KEY ??= "quickAction";
quickActionGlobals.QUICK_ACTION_ADD ??= "add";
quickActionGlobals.QUICK_ACTION_COMPONENT_KEY ??= "quickActionComponent";

export default defineNuxtPlugin(() => {});
