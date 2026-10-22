<script setup lang="ts">
import { computed, watch } from 'vue'
import { routeSnippetRequest, toCurl } from '../../utils/snippets'
import { hasRequestBody } from '../../utils/http'
import { windowParts } from '../../utils/routeExplorer'
import { linkedPeriod } from '../../utils/logsQuery'
import ApiMethodBadge from '../internal/ApiMethodBadge.vue'
import ApiPath from '../internal/ApiPath.vue'

// The selected route, above its tabs: what it is, who may call it, where it
// comes from, and the two ways out — its requests over the page's period and
// a cURL to replay it. It names the route in the tab title and the
// breadcrumb, so two open routes can be told apart.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    fetchUrl: string
    queryKey?: string
    settingsUrl?: string
    /**
     * Query key of the page's tabs, and the slots of the Statistics tab
     * (the first, which the URL names by its slot or not at all) and of the
     * tester (it has its own cURL).
     */
    tabKey?: string
    statisticsTab?: string
    testerTab?: string
    /** The live feed (`LIVE_REQUESTS_TOPIC`): the state is read again on it. */
    realtimeTopic?: string
  }>(),
  {
    queryKey: 'route',
    settingsUrl: '/modules/api/settings',
    tabKey: 'tab',
    statisticsTab: 'statistics',
    testerTab: 'tester',
  },
)

/**
 * How sure the console is that a call needs a session: a guard in the code,
 * signs of one (401 answers), or nothing to tell. Never "public": no guard
 * found does not mean anyone may call it.
 */
const AUTH_DISPLAY = {
  required: { icon: 'i-ph-lock-simple', label: 'api.routes.header.auth' },
  probable: {
    icon: 'i-ph-shield-check',
    label: 'api.routes.header.auth_probable',
  },
  unknown: { icon: 'i-ph-question', label: 'api.routes.header.auth_unknown' },
} as const

const STATE_TONE = {
  failing: 'error',
  slow: 'warning',
  'client-errors': 'warning',
  recovered: 'info',
  healthy: 'success',
  idle: 'neutral',
} as const

const { t } = useI18n()
const dateFormat = useDateFormat()
const toast = useToast()
const page = useDmsRoute()
const recordLabel = usePageRecordLabel()
const {
  data: route,
  pending,
  missing,
  selection,
  refresh,
  error,
} = useRouteDetail(props.fetchUrl, props.queryKey)
const apiOrigin = useApiOrigin(() => route.value?.apiOrigin)
const period = useApiPeriod()
const auth = computed(() =>
  route.value ? AUTH_DISPLAY[route.value.auth?.status ?? 'unknown'] : null,
)

const requestsLink = computed(() => {
  if (!route.value) return ''
  // The page's period, which the request logs' selector reads the same.
  const query = new URLSearchParams({
    route: route.value.ref,
    ...linkedPeriod(period.value),
  })
  return `/modules/api/logs?${query}`
})

/** "Failing · last 24 h": the state, with the window it is judged on. */
const stateLabel = computed(() => {
  if (!route.value) return ''
  const label = t(`api.routes.state.${route.value.state.replace('-', '_')}`)
  const minutes = route.value.healthWindowMinutes
  if (!minutes) return label
  const { unit, amount } = windowParts(minutes)
  return t('api.routes.header.state_window', {
    state: label,
    window: t(`api.routes.window.${unit}`, { amount }),
  })
})

// The breadcrumb label is held with the page's path: it never shows on
// another page, so it needs no clearing when the page goes.
const opened = computed(() => route.value?.ref ?? null)
useHead({
  title: computed(() =>
    opened.value ? `${opened.value} · ${t('api.routes.title')}` : undefined,
  ),
})
watch(
  opened,
  (ref) =>
    recordLabel.setLabel(
      page.path,
      ref ? t('api.routes.header.crumb', { route: ref }) : undefined,
    ),
  { immediate: true },
)

const source = computed(() => {
  if (!route.value) return ''
  if (route.value.own) return t('api.routes.header.own')
  return route.value.module
    ? t('api.routes.header.module', { module: route.value.module })
    : t('api.routes.header.unknown_source')
})

const FIRST_SEEN: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }

/** The day the route first answered, as far back as the statistics go. */
const firstSeen = computed(() => {
  const at = route.value?.firstCallAt
  if (!at) return ''
  return t('api.routes.header.first_seen', {
    date: dateFormat.value(FIRST_SEEN).format(new Date(at)),
  })
})

// The tester copies the cURL of the request it is building: a second one,
// of the bare route, would be a different command under the same name.
const onTester = computed(() => page.query[props.tabKey] === props.testerTab)

// Live, the route's state is read again on the Statistics tab only: the
// documentation and the tester read the same detail, and must not move.
usePageLiveRefresh(
  () => {
    const tab = page.query[props.tabKey]
    if (!tab || tab === props.statisticsTab) void refresh()
  },
  { realtimeTopic: props.realtimeTopic },
)

async function copyCurl() {
  if (!route.value) return
  const curl = toCurl(
    routeSnippetRequest(
      route.value,
      apiOrigin.value,
      hasRequestBody(route.value.method),
    ),
  )
  try {
    await navigator.clipboard.writeText(curl)
    toast.add({
      title: t('api.request.curl_copied'),
      color: 'success',
      icon: 'i-ph-check',
    })
  } catch {
    toast.add({
      title: t('api.request.copy_failed'),
      color: 'error',
      icon: 'i-ph-warning',
    })
  }
}
</script>

<template>
  <div class="flex scroll-mt-4 flex-col gap-3">
    <DmsCard v-if="!selection.ref.value" :padded="false" class="px-5 py-8">
      <DmsEmptyState
        icon="i-ph-tree-structure"
        :title="t('api.routes.header.pick_title')"
        :description="t('api.routes.header.pick_description')"
      />
    </DmsCard>

    <DmsCard v-else-if="pending" :padded="false" class="px-5 py-4">
      <USkeleton class="h-3 w-40" />
      <USkeleton class="mt-3 h-7 w-72" />
      <USkeleton class="mt-3 h-3 w-96" />
    </DmsCard>

    <DmsCard v-else-if="!route" :padded="false" class="px-5 py-6">
      <DmsEmptyState
        :variant="missing ? 'no-result' : 'error'"
        :title="
          missing
            ? t('api.routes.header.missing_title', {
                route: selection.ref.value,
              })
            : t('api.routes.header.error_title')
        "
        :description="
          missing
            ? t('api.routes.header.missing_description')
            : String((error as Error)?.message ?? '')
        "
        :actions="
          missing
            ? [
                {
                  label: t('api.routes.header.clear'),
                  color: 'neutral',
                  variant: 'outline',
                  onClick: () => selection.select(null),
                },
              ]
            : [{ label: t('api.common.retry'), onClick: () => refresh() }]
        "
      />
    </DmsCard>

    <DmsCard v-else :padded="false" class="px-5 py-4">
      <p class="text-dimmed flex items-center gap-1.5 font-mono text-[11.5px]">
        <UIcon name="i-ph-folder-simple" class="size-3.5" />
        {{ route.folder }}
        <template v-if="route.controller">· {{ route.controller }}</template>
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <ApiMethodBadge :method="route.method" />
        <ApiPath
          :path="route.path"
          class="text-highlighted text-xl font-semibold tracking-tight"
        />
        <DmsCopyButton :value="route.path" />
        <span class="grow" />
        <UButton
          :to="requestsLink"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-list-magnifying-glass"
          :label="t('api.routes.header.requests')"
        />
        <UButton
          v-if="!onTester"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-terminal"
          :label="t('api.request.copy_curl')"
          @click="copyCurl"
        />
      </div>
      <div
        class="text-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]"
      >
        <DmsStatusPill
          :tone="STATE_TONE[route.state]"
          :label="stateLabel"
          :dot="route.state === 'idle' ? 'static' : 'live'"
          :mono="false"
          variant="text"
        />
        <span class="inline-flex items-center gap-1.5 font-mono text-[12px]">
          <UIcon name="i-ph-code" class="size-3.5" />
          {{
            route.controller
              ? `${route.controller}.${route.handler}`
              : route.handler
          }}
        </span>
        <span
          v-if="auth"
          class="inline-flex items-center gap-1.5"
          :title="route.auth?.guards.join(', ') || undefined"
        >
          <UIcon :name="auth.icon" class="size-3.5" />
          {{ t(auth.label) }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <UIcon name="i-ph-cube" class="size-3.5" />
          {{ source }}
        </span>
        <span
          v-if="firstSeen"
          class="inline-flex items-center gap-1.5"
          :title="t('api.routes.header.first_seen_hint')"
        >
          <UIcon name="i-ph-calendar-blank" class="size-3.5" />
          {{ firstSeen }}
        </span>
      </div>
    </DmsCard>

    <UAlert
      v-if="route && route.inScope === false"
      color="neutral"
      variant="subtle"
      icon="i-ph-funnel"
      :title="t('api.routes.header.out_of_scope_title')"
      :description="t('api.routes.header.out_of_scope_description')"
      :actions="[
        {
          label: t('api.routes.header.out_of_scope_action'),
          to: settingsUrl,
          color: 'neutral',
          variant: 'outline',
          size: 'xs',
        },
      ]"
    />
  </div>
</template>
