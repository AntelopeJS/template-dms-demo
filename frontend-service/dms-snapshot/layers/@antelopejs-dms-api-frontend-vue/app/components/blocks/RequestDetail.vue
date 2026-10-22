<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { byteLength, formatMs } from '../../utils/format'
import { errorStatus } from '../../utils/http'
import {
  durationScale,
  fullDateTime,
  isRequestId,
  NO_REDACTIONS,
  originalBodySize,
  type Redactions,
  type RequestPivot,
  requestPivots,
  requestUrl,
  type RouteLatency,
  thresholdRatio,
  withParam,
} from '../../utils/requestDrawer'
import { capturedSnippetRequest, toCurl } from '../../utils/snippets'
import ApiBody from '../internal/ApiBody.vue'
import ApiKeyValues from '../internal/ApiKeyValues.vue'
import ApiStatusBadge from '../internal/ApiStatusBadge.vue'
import ApiTesterBadge from '../internal/ApiTesterBadge.vue'

// One captured request, in the DMS side panel on the right, which a request
// table's row opens (a `sidePanel` row action, `src/pages/request-table.ts`).
// The DMS draws the panel's header: the request's method and path
// ("POST /api/orders", its `rowTitle`), "Request 3 of 50 shown", the previous
// / next buttons, J / K and close, and the not-found state of a `?record=`
// that names no stored request. Here, the top stays put: where the request
// went, how it ended, what to do with it. Below, the summary puts
// the error first, then what the request was and how long it took against
// the slow threshold; then what was sent and what came back. Every action
// leads somewhere: the tester, the route, the requests alike.

interface RequestLog {
  _id: string
  timestamp: string
  method: string
  uri: string
  rawPath: string
  route: string
  routeRegistered: boolean
  statusCode: number
  /** Null when the request never reached a handler. */
  responseTimeMs: number | null
  slowThresholdMs: number
  /** How the route behaves lately; null for a route not registered. */
  routeLatency?: RouteLatency | null
  /** The method of the handler that answered (GET for a HEAD it served). */
  routeMethod?: string | null
  /** What the capture masked, section by section. */
  redactions: Redactions
  /** `tester` for a request the console's tester sent. */
  source?: string | null
  /** Where the API answers, for the URL and the cURL; null while unknown. */
  apiOrigin?: string | null
  /** The `x-request-id` it came with, when it is not its id. */
  requestId?: string | null
  ip?: string
  userAgent?: string
  pathParams?: Record<string, string>
  query?: Record<string, string | string[]>
  requestHeaders?: Record<string, string>
  requestBody?: string
  requestBodyTruncated?: boolean
  requestBodyOmitted?: string | null
  requestBodySize?: number | null
  responseHeaders?: Record<string, string>
  responseBody?: string
  responseBodyTruncated?: boolean
  responseBodyOmitted?: string | null
  responseBodySize?: number | null
  error?: { message: string; stack?: string }
  links: {
    route: string | null
    tester: string | null
    sameError: string | null
    sameRoute: string
    samePath?: string | null
  }
}

/** Where the console's pages are: the page on screen names its own links. */
const MODULE_BASE = '/modules/api'
/** Pages a link to the request logs may name as its origin (`?from=`). */
const LINK_ORIGINS = ['overview', 'routes']
/** The settings an owner reads: body capture off says why a body is missing. */
const SETTINGS_SUMMARY_API = '/api/monitoring/settings/summary'
/** Where the captured headers are listed. */
const HEADERS_SETTINGS_LINK = '/modules/api/settings#requestLogCaptureHeaders'
const TESTER_SOURCE = 'tester'
/** The icon of each list of related requests in "See also". */
const PIVOT_ICONS: Record<RequestPivot['kind'], string> = {
  same_route: 'i-ph-list-magnifying-glass',
  same_path: 'i-ph-path',
  slow_route: 'i-ph-timer',
}

const props = defineProps<{
  /** The row the table opened: its `_id` names the request. */
  rowData?: { _id?: string }
  /**
   * Where the table reads a request in full, by its own permission (`/<id>`
   * appended), so the panel opens wherever its rows show.
   */
  detailUrl: string
}>()

const { t } = useI18n()
const {
  formatLocale: locale,
  formatNumber: count,
  formatRelativeTime,
} = useRegionalFormat({ locale: 'format' })
const toast = useToast()
// Read through the router, not `useDmsRoute()`: each call of it reassigns
// the route's query, which the request tables watch for their filters.
const router = useDmsRouter()

const requestId = computed(() => props.rowData?._id ?? null)

// The page the panel is open on: a link to the logs says where it came from,
// and the route on screen is not offered again.
const page = computed(() => {
  const current = router.currentRoute.value.path
  return current.startsWith(`${MODULE_BASE}/`)
    ? current.slice(MODULE_BASE.length + 1)
    : ''
})

const logRead = useApiData<RequestLog>(
  () =>
    requestId.value && isRequestId(requestId.value)
      ? `${props.detailUrl}/${encodeURIComponent(requestId.value)}`
      : null,
  // A request's log never changes once captured.
  { refreshOnPageRefresh: false },
)
const { error, refresh } = logRead
// Another request shows nothing until its log is in.
const log = computed(() =>
  logRead.placeholder.value ? null : logRead.data.value,
)
const pending = computed(() => logRead.pending.value && !log.value)
const apiOrigin = useApiOrigin(() => log.value?.apiOrigin)

const tab = ref('overview')
const tabs = computed(() => [
  { label: t('api.request.tabs.overview'), value: 'overview' },
  { label: t('api.request.tabs.request'), value: 'request' },
  { label: t('api.request.tabs.response'), value: 'response' },
])

// Why nothing shows: a link naming no request, a request pruned, a role that
// lists requests but may not read them, the console not answering.
const failure = computed<'invalid' | 'not_found' | 'forbidden' | 'error'>(
  () => {
    if (requestId.value && !isRequestId(requestId.value)) return 'invalid'
    const status = errorStatus(error.value)
    if (status === 404) return 'not_found'
    if (status === 401 || status === 403) return 'forbidden'
    return 'error'
  },
)

// Closing is the DMS header's: only a failed read offers something here.
const failureActions = computed(() =>
  failure.value === 'error'
    ? [
        {
          label: t('api.common.retry'),
          icon: 'i-ph-arrow-clockwise',
          onClick: () => refresh(),
        },
      ]
    : [],
)

// --- the header ---
const url = computed(() =>
  log.value
    ? requestUrl(apiOrigin.value ?? '', log.value.rawPath, log.value.query)
    : '',
)
const isTester = computed(() => log.value?.source === TESTER_SOURCE)
const timing = computed(() =>
  log.value && log.value.responseTimeMs !== null
    ? durationScale(log.value.responseTimeMs, log.value.slowThresholdMs)
    : null,
)
const ratio = computed(() =>
  thresholdRatio(timing.value?.ratio ?? 0, locale.value),
)

// --- the error, folded to six lines ---
const message = ref<HTMLElement | null>(null)
const messageOpen = ref(false)
const messageClamped = ref(false)

watch([message, () => log.value?.error?.message], async ([element]) => {
  messageClamped.value = false
  if (!element) return
  await nextTick()
  messageClamped.value = element.scrollHeight > element.clientHeight + 1
})

// --- the summary ---
const general = computed(() => {
  const value = log.value
  if (!value) return []
  const rows: { key: string; label: string; value: string; copy?: boolean }[] =
    [
      { key: 'url', label: t('api.request.fields.url'), value: url.value },
      {
        key: 'date',
        label: t('api.request.fields.date'),
        value: `${fullDateTime(value.timestamp, dateFormat.value)} · ${formatRelativeTime(value.timestamp)}`,
      },
      {
        key: 'route',
        label: t('api.request.fields.route'),
        value: value.routeRegistered
          ? value.route
          : `${value.route} · ${t('api.request.unmatched')}`,
      },
    ]
  if (value.ip)
    rows.push({ key: 'ip', label: t('api.request.fields.ip'), value: value.ip })
  if (value.userAgent)
    rows.push({
      key: 'user_agent',
      label: t('api.request.fields.user_agent'),
      value: value.userAgent,
    })
  rows.push({
    key: 'request_id',
    label: t('api.request.fields.request_id'),
    value: value._id,
    copy: true,
  })
  if (value.requestId && value.requestId !== value._id)
    rows.push({
      key: 'header_request_id',
      label: 'x-request-id',
      value: value.requestId,
      copy: true,
    })
  return rows
})

// --- actions ---
const curl = computed(() =>
  log.value ? toCurl(capturedSnippetRequest(log.value, apiOrigin.value)) : '',
)

async function copyCurl() {
  try {
    await navigator.clipboard.writeText(curl.value)
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

// The tester takes over with `?replay=<id>`: it reads the request itself.
const testerLink = computed(() =>
  log.value?.links.tester
    ? `${log.value.links.tester}&replay=${encodeURIComponent(log.value._id)}`
    : null,
)

function logsLink(href: string): string {
  return LINK_ORIGINS.includes(page.value)
    ? withParam(href, 'from', page.value)
    : href
}

const sameErrorLink = computed(() =>
  log.value?.links.sameError ? logsLink(log.value.links.sameError) : null,
)

const seeAlso = computed(() => {
  const value = log.value
  if (!value) return []
  const onRoute =
    page.value === 'routes' &&
    router.currentRoute.value.query.route === value.route
  return [
    ...(value.links.route && !onRoute
      ? [
          {
            label: t('api.request.open_route'),
            icon: 'i-ph-tree-structure',
            to: value.links.route,
          },
        ]
      : []),
    ...requestPivots(value).map((pivot) => ({
      label: t(`api.request.${pivot.kind}`),
      icon: PIVOT_ICONS[pivot.kind],
      to: logsLink(pivot.to),
    })),
  ]
})

// A log stored without the reason of a missing body: the body capture turned
// off says it. Read once per session, only then, in the browser, and by an
// owner only: a refusal leaves the generic reason.
const settingsSummary = useApiData<{ requestLogMaxBodyKb?: number }>(
  SETTINGS_SUMMARY_API,
  { immediate: false, server: false, refreshOnPageRefresh: false },
)

onMounted(() =>
  watch(
    log,
    (value) => {
      if (!value || settingsSummary.status.value !== 'idle') return
      const unexplained =
        (!value.requestBody && !value.requestBodyOmitted) ||
        (!value.responseBody && !value.responseBodyOmitted)
      if (unexplained) void settingsSummary.execute()
    },
    { immediate: true },
  ),
)

function omission(reason: string | null | undefined) {
  if (reason) return reason
  const summary = settingsSummary.data.value
  return summary && summary.requestLogMaxBodyKb === 0 ? 'disabled' : null
}

const redactions = computed(() => log.value?.redactions ?? NO_REDACTIONS)
const requestSize = computed(() =>
  originalBodySize(
    byteLength(log.value?.requestBody ?? ''),
    log.value?.requestBodyTruncated,
    log.value?.requestBodySize,
    log.value?.requestHeaders,
  ),
)
const responseSize = computed(() =>
  originalBodySize(
    byteLength(log.value?.responseBody ?? ''),
    log.value?.responseBodyTruncated,
    log.value?.responseBodySize,
    log.value?.responseHeaders,
  ),
)

const dateFormat = useDateFormat()
</script>

<template>
  <section class="-m-4 flex min-h-0 flex-col" :aria-busy="pending">
    <header
      v-if="log"
      class="border-default bg-default sticky top-0 z-10 flex shrink-0 flex-col gap-2.5 border-b px-4 pt-3 sm:px-5"
    >
      <div class="flex min-w-0 items-center gap-1">
        <bdi
          class="text-muted min-w-0 truncate font-mono text-[11.5px]"
          :title="url"
        >
          {{ url }}
        </bdi>
        <DmsCopyButton :value="url" :aria-label="t('api.request.copy_url')" />
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
        <ApiStatusBadge :status="log.statusCode" text size="sm" />
        <span
          v-if="timing"
          class="font-mono tabular-nums"
          :class="timing.slow ? 'text-warning font-semibold' : 'text-muted'"
        >
          {{ formatMs(log.responseTimeMs ?? 0, locale) }}
        </span>
        <UTooltip v-else :text="t('api.request.not_measured_hint')">
          <span class="text-dimmed font-mono" tabindex="0">
            — {{ t('api.request.not_measured') }}
          </span>
        </UTooltip>
        <UBadge
          v-if="timing?.slow"
          size="sm"
          color="warning"
          variant="subtle"
          icon="i-ph-timer"
          :label="t('api.request.slow_ratio', { ratio })"
        />
        <ApiTesterBadge v-if="isTester" />
        <span
          class="text-dimmed font-mono text-[11.5px]"
          :title="fullDateTime(log.timestamp, dateFormat)"
        >
          {{ formatRelativeTime(log.timestamp) }}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-if="testerLink"
          :to="testerLink"
          size="sm"
          icon="i-ph-paper-plane-tilt"
          :label="t('api.request.replay')"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-terminal"
          :label="t('api.request.copy_curl')"
          @click="copyCurl"
        />
        <UButton
          v-if="sameErrorLink"
          :to="sameErrorLink"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-copy-simple"
          :label="t('api.request.same_error')"
        />
        <UDropdownMenu :items="seeAlso" :content="{ align: 'end' }">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            trailing-icon="i-ph-caret-down"
            :label="t('api.request.see_also')"
          />
        </UDropdownMenu>
      </div>

      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
        variant="link"
        size="sm"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      <div v-if="pending" class="flex flex-col gap-3">
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-28 w-full" />
        <USkeleton class="h-20 w-full" />
      </div>

      <DmsEmptyState
        v-else-if="!log"
        variant="error"
        :title="t(`api.request.${failure}_title`)"
        :description="t(`api.request.${failure}_description`)"
        :actions="failureActions"
      />

      <div v-else-if="tab === 'overview'" class="flex flex-col gap-5">
        <section v-if="log.error" class="flex flex-col gap-2">
          <DmsEyebrow :label="t('api.request.error')" />
          <div class="border-error/40 bg-error/5 rounded-md border px-3 py-2.5">
            <div class="flex items-start gap-2">
              <p
                ref="message"
                class="text-error min-w-0 grow whitespace-pre-wrap text-sm font-semibold [overflow-wrap:anywhere]"
                :class="messageOpen ? '' : 'line-clamp-6'"
              >
                <bdi>{{ log.error.message }}</bdi>
              </p>
              <DmsCopyButton
                :value="log.error.message"
                :aria-label="t('api.request.copy_message')"
              />
            </div>
            <UButton
              v-if="messageClamped || messageOpen"
              size="xs"
              color="error"
              variant="link"
              class="mt-1 px-0"
              :label="
                messageOpen
                  ? t('api.request.show_less')
                  : t('api.request.show_all')
              "
              :aria-expanded="messageOpen"
              @click="messageOpen = !messageOpen"
            />
          </div>
          <DmsCodeSnippet
            v-if="log.error.stack"
            :code="log.error.stack"
            max-height="18rem"
            wrap="anywhere"
          />
        </section>

        <section class="flex flex-col gap-2">
          <DmsEyebrow :label="t('api.request.general')" />
          <dl
            class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]"
          >
            <template v-for="row in general" :key="row.key">
              <dt class="text-muted">{{ row.label }}</dt>
              <dd class="text-default flex min-w-0 items-start gap-1">
                <bdi
                  class="min-w-0 font-mono text-[12px] [overflow-wrap:anywhere]"
                >
                  {{ row.value }}
                </bdi>
                <DmsCopyButton
                  v-if="row.copy"
                  :value="row.value"
                  class="-my-1.5"
                />
              </dd>
            </template>
            <template v-if="isTester">
              <dt class="text-muted">{{ t('api.request.fields.source') }}</dt>
              <dd class="text-default">{{ t('api.request.source_tester') }}</dd>
            </template>
          </dl>
        </section>

        <section class="flex flex-col gap-2">
          <DmsEyebrow :label="t('api.request.timing')" />
          <template v-if="timing">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span class="text-highlighted font-mono text-xl font-semibold">
                {{ formatMs(log.responseTimeMs ?? 0, locale) }}
              </span>
              <span
                class="text-xs"
                :class="
                  timing.slow ? 'text-warning font-semibold' : 'text-dimmed'
                "
              >
                {{
                  timing.slow
                    ? t('api.request.slow_ratio', { ratio })
                    : t('api.request.threshold_ratio', { ratio })
                }}
              </span>
              <span
                v-if="log.routeLatency"
                class="text-dimmed font-mono text-xs tabular-nums"
              >
                {{
                  t(
                    'api.request.route_latency',
                    {
                      days: count(log.routeLatency.windowDays),
                      p50: formatMs(log.routeLatency.p50, locale),
                      p95: formatMs(log.routeLatency.p95, locale),
                    },
                    log.routeLatency.windowDays,
                  )
                }}
              </span>
            </div>
            <div
              class="bg-elevated relative h-2 rounded-full"
              role="meter"
              :aria-label="t('api.request.meter_label')"
              aria-valuemin="0"
              :aria-valuemax="Math.round(timing.max)"
              :aria-valuenow="Math.round(log.responseTimeMs ?? 0)"
              :aria-valuetext="formatMs(log.responseTimeMs ?? 0, locale)"
            >
              <div
                class="h-full rounded-full"
                :class="timing.slow ? 'bg-warning' : 'bg-primary'"
                :style="{ width: `${timing.share}%` }"
              />
              <div
                class="bg-inverted/60 absolute -inset-y-1 w-0.5 rounded-full"
                :style="{ left: `${timing.threshold}%` }"
                aria-hidden="true"
              />
            </div>
            <p class="text-dimmed text-xs">
              {{
                t('api.request.threshold', {
                  threshold: formatMs(log.slowThresholdMs, locale),
                })
              }}
            </p>
          </template>
          <p v-else class="text-dimmed text-sm">
            {{ t('api.request.not_measured_hint') }}
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <DmsEyebrow :label="t('api.request.path_params')" />
          <ApiKeyValues
            :values="log.pathParams"
            :empty="t('api.request.no_path_params')"
          />
        </section>
      </div>

      <div v-else-if="tab === 'request'" class="flex flex-col gap-5">
        <section class="flex flex-col gap-2">
          <DmsEyebrow :label="t('api.request.headers')" />
          <ApiKeyValues
            :values="log.requestHeaders"
            :empty="t('api.request.no_headers')"
          />
          <p
            v-if="redactions.headers.length"
            class="text-dimmed inline-flex items-start gap-1 text-xs"
          >
            <UIcon name="i-ph-eye-slash" class="mt-0.5 shrink-0" />
            {{
              t('api.request.redacted_headers', {
                names: redactions.headers.join(', '),
              })
            }}
          </p>
          <p class="text-dimmed text-xs">
            {{ t('api.request.headers_hint') }}
            <ULink
              :to="HEADERS_SETTINGS_LINK"
              class="text-primary whitespace-nowrap hover:underline"
            >
              {{ t('api.request.headers_settings') }}
            </ULink>
          </p>
        </section>
        <section
          v-if="log.query && Object.keys(log.query).length"
          class="flex flex-col gap-2"
        >
          <DmsEyebrow :label="t('api.request.query')" />
          <ApiKeyValues :values="log.query" :empty="''" />
          <p
            v-if="redactions.query > 0"
            class="text-dimmed inline-flex items-center gap-1 text-xs"
          >
            <UIcon name="i-ph-eye-slash" />
            {{
              t(
                'api.request.redacted_query',
                { count: count(redactions.query) },
                redactions.query,
              )
            }}
          </p>
        </section>
        <section class="flex flex-col gap-2">
          <DmsEyebrow :label="t('api.request.body')" />
          <ApiBody
            kind="request"
            :body="log.requestBody"
            :truncated="log.requestBodyTruncated"
            :omitted="omission(log.requestBodyOmitted)"
            :original-size="requestSize"
            :method="log.method"
          />
          <p
            v-if="redactions.requestBody > 0"
            class="text-dimmed inline-flex items-center gap-1 text-xs"
          >
            <UIcon name="i-ph-eye-slash" />
            {{
              t(
                'api.request.redacted',
                { count: count(redactions.requestBody) },
                redactions.requestBody,
              )
            }}
          </p>
        </section>
      </div>

      <div v-else class="flex flex-col gap-5">
        <section class="flex flex-col gap-2">
          <DmsEyebrow :label="t('api.request.headers')" />
          <ApiKeyValues
            :values="log.responseHeaders"
            :empty="t('api.request.no_headers')"
          />
        </section>
        <section class="flex flex-col gap-2">
          <DmsEyebrow :label="t('api.request.body')" />
          <ApiBody
            kind="response"
            :body="log.responseBody"
            :truncated="log.responseBodyTruncated"
            :omitted="omission(log.responseBodyOmitted)"
            :original-size="responseSize"
          />
          <p
            v-if="redactions.responseBody > 0"
            class="text-dimmed inline-flex items-center gap-1 text-xs"
          >
            <UIcon name="i-ph-eye-slash" />
            {{
              t(
                'api.request.redacted',
                { count: count(redactions.responseBody) },
                redactions.responseBody,
              )
            }}
          </p>
        </section>
      </div>
    </div>
  </section>
</template>
