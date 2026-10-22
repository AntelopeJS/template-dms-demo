import { computed, onMounted, ref, type ComputedRef } from 'vue'

/**
 * `read()` once the browser has mounted the component, `undefined` before:
 * for a value the server and the browser may write differently, which the
 * server's HTML must not hold. A date written with its weekday is one: the
 * ICU of Node and the one of the browser disagree on its punctuation
 * ("Thursday, 15 October" against "Thursday 15 October" in `en-GB`), and the
 * hydration would report the mismatch. Meant for what the first paint can do
 * without, such as a tooltip.
 */
export function useClientValue<T>(read: () => T): ComputedRef<T | undefined> {
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  return computed(() => (mounted.value ? read() : undefined))
}
