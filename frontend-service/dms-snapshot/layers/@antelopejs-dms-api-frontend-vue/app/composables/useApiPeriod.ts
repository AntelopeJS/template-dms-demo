import { computed, onMounted, ref } from 'vue'

/** Id of the console pages' `PeriodSelector` (`PERIOD_SCOPE`, server side). */
const PERIOD_SCOPE = 'api'

/**
 * The period of the page as its DMS `PeriodSelector` resolves it: from the
 * URL, else the user's last choice, else its default. `null` until the
 * block is mounted: the period registry is client-only, and the server
 * render and the hydration have to agree.
 */
export function useApiPeriod() {
  const scope = usePeriodScope(PERIOD_SCOPE)
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  return computed(() => (mounted.value ? scope.value : null))
}
