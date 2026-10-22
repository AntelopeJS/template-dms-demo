<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted } from 'vue'

// "Own routes · 42": the route scope every page of the console is filtered
// by, linking to where it is changed. The backend fills it per request, and
// the chip reads it again as it mounts or comes back from the page cache
// (back from Settings, where the scope changes), when its tab is shown again
// (changed in another tab), and at most once a minute when the page's blocks
// refresh: a page restored from the history keeps the layout it was first
// served with. The scope rarely changes, so the chip does not follow the live
// feed. Present in the toolbar of every live page, it also tells the page's
// live toggle the server errors missed while paused (`useLiveMissedErrors`).
defineOptions({ inheritAttrs: false })

type Scope = 'own' | 'modules' | 'all'

const props = defineProps<{
  scope?: Scope
  routes?: number
  to?: string
  fetchUrl?: string
  /** The live feed (`LIVE_REQUESTS_TOPIC`), whose missed 5xx it counts. */
  realtimeTopic?: string
}>()

const { t } = useI18n()
const { formatNumber } = useRegionalFormat({ locale: 'format' })
const summary = useApiData<{ scope: Scope; routes: number }>(
  () => props.fetchUrl,
  { refreshOnPageRefresh: false },
)

const scope = computed(() => summary.data.value?.scope ?? props.scope ?? 'own')
const routes = computed(() => summary.data.value?.routes ?? props.routes ?? 0)

const label = computed(() =>
  t(`api.scope.${scope.value}`, {
    count: formatNumber(routes.value),
  }),
)

/**
 * A refresh of the page's blocks reads the scope again, once a minute at
 * most: it changes on the Settings page, not with traffic.
 */
const REFRESH_INTERVAL_MS = 60_000

// When the chip last asked (the mount reads it), so that a failing read is
// not retried each tick.
let lastAskedAt = Date.now()

function read() {
  lastAskedAt = Date.now()
  void summary.refresh()
}

function refreshIfStale() {
  if (Date.now() - lastAskedAt >= REFRESH_INTERVAL_MS) read()
}

usePageLiveRefresh(refreshIfStale)
if (props.realtimeTopic) useLiveMissedErrors(props.realtimeTopic)

function refreshWhenShown() {
  if (document.visibilityState === 'visible') read()
}

// The first activation follows the mount, which already read the scope.
let activated = false
onActivated(() => {
  if (activated) read()
  activated = true
})

onMounted(() => document.addEventListener('visibilitychange', refreshWhenShown))
onBeforeUnmount(() =>
  document.removeEventListener('visibilitychange', refreshWhenShown),
)
</script>

<template>
  <UTooltip :text="t('api.scope.tooltip')">
    <UButton
      :to="to"
      :label="label"
      icon="i-ph-funnel"
      color="neutral"
      variant="outline"
      size="sm"
      class="font-mono text-xs"
    />
  </UTooltip>
</template>
