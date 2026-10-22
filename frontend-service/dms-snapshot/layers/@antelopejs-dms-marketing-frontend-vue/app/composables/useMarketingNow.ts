import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

const RENDERED_AT_STATE_KEY = 'marketing-rendered-at'

/**
 * The current time, in epoch ms, for what a page writes relative to it
 * ("12 seconds ago", a site still live): the time the server rendered the
 * page, which the browser hydrating its HTML starts from too, then the
 * browser's clock once mounted, every `tickMs`.
 */
export function useMarketingNow(tickMs: number): Ref<number> {
  const renderedAt = useDmsState<number>(
    RENDERED_AT_STATE_KEY,
    () => Date.now(),
    { transfer: true },
  )
  const now = ref(renderedAt.value)
  let clock: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    now.value = Date.now()
    clock = setInterval(() => (now.value = Date.now()), tickMs)
  })
  onBeforeUnmount(() => {
    if (clock) {
      clearInterval(clock)
    }
  })
  return now
}
