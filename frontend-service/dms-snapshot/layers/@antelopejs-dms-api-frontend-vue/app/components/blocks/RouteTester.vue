<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  useId,
  watch,
} from 'vue'
import {
  byteLength,
  formatBytes,
  formatClock,
  formatMs,
  prettyBody,
} from '../../utils/format'
import {
  acceptsRequestBody,
  errorStatus,
  isWritingMethod,
  pathSegments,
  statusText,
} from '../../utils/http'
import { fillPath, toCurl } from '../../utils/snippets'
import {
  authModeOf,
  type AuthMode,
  type BodyMode,
  type CapturedRequest,
  capturedSummary,
  contentTypeFor,
  countRedacted,
  formatJson,
  hasRedacted,
  inputProblem,
  jsonProblem,
  type KeyValue,
  createSourceTokens,
  markedHeaders,
  mergeHeaders,
  neverSent,
  newRequestId,
  PROXY_BODY_LIMIT,
  PROXY_RESPONSE_LIMIT,
  PROXY_TIMEOUT_MS,
  redactedFields,
  replayFrom,
  revealBidi,
  sendTesterRequest,
  serializeBody,
  SIZE_PROBE_SOURCE,
  TesterError,
  type TesterSourceToken,
  TESTER_SOURCE_URL,
  type TesterErrorCode,
  type TesterRequest,
  type TesterResult,
  withQueryRows,
} from '../../utils/testerRequest'
import {
  type BodyOrigin,
  type DraftRequest,
  exampleRequest,
  hasConfirmedWrite,
  type HistoryEntry,
  HISTORY_MAX,
  historyEntry,
  isSecretHeader,
  loadCommonHeaders,
  loadDraft,
  loadHistory,
  lostSecrets,
  patchResult,
  rememberConfirmedWrite,
  type ReplayInfo,
  sameRequest,
  saveCommonHeaders,
  saveDraft,
  saveHistory,
  secretNames,
  type TesterDraft,
} from '../../utils/testerHistory'
import ApiKeyValues from '../internal/ApiKeyValues.vue'
import ApiMethodBadge from '../internal/ApiMethodBadge.vue'
import ApiStatusBadge from '../internal/ApiStatusBadge.vue'

// Call the selected route from the dashboard. The URL bar holds the method,
// the path with its parameters to fill in, and Send; the body starts from
// the last request the route accepted. A route keeps its draft for the
// session (body, headers, query, path values, last answer), across tabs,
// routes and pages. A call that writes data is confirmed first, and the
// answer shows its status, the browser and server times and what the module
// captured of it (`x-request-id`). `?replay=<request id>` loads a captured
// request once, then leaves the URL.
//
// Typing in one of its fields holds the page's live mode ("Paused · typing in
// the Tester"), so the route's figures do not move under the request being
// written; leaving the Tester releases it.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ fetchUrl: string; queryKey?: string }>(),
  {
    queryKey: 'route',
  },
)

interface Row extends KeyValue {
  id: number
}

/** A row of the logs list, as far as finding a captured call goes. */
interface CapturedRow {
  _id: string
  route?: string
  timestamp: string
  requestId?: string
}

type CapturedState = 'idle' | 'loading' | 'found' | 'missing' | 'error'

/** A backend read of the tester's own flows (a replay, a capture lookup). */
type ReadJson = <R>(url: string) => Promise<R>

/**
 * A read the tester runs when it needs it (a replay, a lookup after a call),
 * in the browser only and never again on the page's refreshes.
 */
const ON_DEMAND = {
  immediate: false,
  server: false,
  watch: false,
  refreshOnPageRefresh: false,
} as const

// The tester's own reads of the request logs: by its permission, not the
// request logs page's.
const LOGS_API = '/api/monitoring/logs/tester'
const LOGS_PAGE = '/modules/api/logs'
/**
 * Abort reason of a call left behind by a route change: filed under its
 * route as abandoned, since the API may have received it.
 */
const ROUTE_CHANGED = 'route-changed'
/** The capture is written once the answer is sent: looked for twice. */
const CAPTURE_DELAYS_MS = [400, 1500]
/** A captured call older than this is not the one just sent. */
const CAPTURE_MATCH_MS = 60_000
/** An id as long as a real one, to size the request before sending it. */
const SIZE_PROBE_ID = '00000000-0000-0000-0000-000000000000'
const DRAFT_SAVE_DELAY_MS = 250
const BODY_MODES: BodyMode[] = ['json', 'text', 'form', 'none']
const AUTH_ICONS: Record<AuthMode, string> = {
  session: 'i-ph-user-check',
  manual: 'i-ph-key',
  none: 'i-ph-lock-simple-open',
}
const ERROR_ICONS: Partial<Record<TesterErrorCode, string>> = {
  invalid_input: 'i-ph-prohibit',
  body_too_large: 'i-ph-file-x',
  not_authenticated: 'i-ph-sign-in',
  not_owner: 'i-ph-lock-simple',
  cross_origin: 'i-ph-shield-warning',
  response_too_large: 'i-ph-file-x',
  timeout: 'i-ph-timer',
  aborted: 'i-ph-x-circle',
}
/**
 * Error texts that send to the Captured tab: another text on a route the
 * module does not capture.
 */
const POINTS_TO_CAPTURED: ReadonlySet<string> = new Set([
  'proxy_failed',
  'timeout',
  'aborted',
  'abandoned',
])

const { t } = useI18n()
const { formatLocale: locale } = useRegionalFormat({ locale: 'format' })
const dateFormat = useDateFormat()
const toast = useToast()
const { confirm } = useConfirm()
const { loggedIn } = useDmsUserSession()
const currentRoute = useDmsRoute()
const router = useDmsRouter()
const { $authFetch } = useAuthFetch()
const {
  data: route,
  pending,
  selection,
} = useRouteDetail(props.fetchUrl, props.queryKey)
const apiOrigin = useApiOrigin(() => route.value?.apiOrigin)
const blockerId = useId()
// Not a `useApiData` read: each call mints a short-lived token, which must
// never be shared between calls, cached or handed over with the page.
const sourceTokens = createSourceTokens(() =>
  $authFetch<TesterSourceToken>(TESTER_SOURCE_URL),
)
const bodyHintId = useId()

let nextRowId = 0
const row = (name = '', value = ''): Row => ({ id: nextRowId++, name, value })
const rows = (list: Row[]): KeyValue[] =>
  list.map(({ name, value }) => ({ name, value }))

const bodyMode = ref<BodyMode>('none')
const body = ref('')
const form = reactive<Row[]>([])
const headers = reactive<Row[]>([])
const query = reactive<Row[]>([])
const pathValues = reactive<Record<string, string>>({})
const useSession = ref(true)
const origin = ref<BodyOrigin>('example')
const replayInfo = ref<ReplayInfo | null>(null)
const result = ref<TesterResult | null>(null)
const commonHeaders = reactive<Row[]>(
  loadCommonHeaders().map((entry) => row(entry.name, entry.value)),
)
const history = ref<HistoryEntry[]>([])
const tab = ref('body')
const responseTab = ref('body')
const sending = ref(false)
const capturedState = ref<CapturedState>('idle')
const capturedLog = ref<CapturedRequest | null>(null)

// The route the fields belong to, the call in flight and its route.
let activeRef: string | null = null
// The route the fields were filled for: they come from this browser's drafts,
// history and headers, so the tester shows once mounted, never on a server.
const filledRef = ref<string | null>(null)
let inFlight: { controller: AbortController; ref: string } | null = null
let confirming = false
let unmounted = false

const method = computed(() => route.value?.method ?? 'GET')
const bodyAllowed = computed(() => acceptsRequestBody(method.value))
const writes = computed(() => isWritingMethod(method.value))
const isDelete = computed(() => method.value.toUpperCase() === 'DELETE')

const draftRequest = computed<DraftRequest>(() => ({
  bodyMode: bodyMode.value,
  body: body.value,
  form: rows(form),
  headers: rows(headers),
  query: rows(query),
  pathValues: { ...pathValues },
  useSession: useSession.value,
}))

const example = computed(() =>
  route.value
    ? exampleRequest(
        {
          method: route.value.method,
          pathParams: route.value.pathParams,
          exampleBody: route.value.contract.exampleBody,
          examplePath: route.value.contract.examplePath,
          authStatus: route.value.auth.status,
        },
        history.value,
      )
    : null,
)
const modified = computed(
  () => !!example.value && !sameRequest(draftRequest.value, example.value),
)

// --- The request as it leaves ---

const segments = computed(() =>
  pathSegments(route.value?.path ?? '/').map((segment) => ({
    ...segment,
    name: segment.text.slice(1),
  })),
)
const path = computed(() =>
  withQueryRows(fillPath(route.value?.path ?? '/', pathValues), query),
)
const displayQuery = computed(() => {
  const named = query.filter((entry) => entry.name)
  return named.length
    ? revealBidi(
        `?${named.map((entry) => `${entry.name}=${entry.value}`).join('&')}`,
      )
    : ''
})
const missingPathParams = computed(() =>
  (route.value?.pathParams ?? []).filter((name) => !pathValues[name]),
)

const sentBody = computed(() =>
  bodyAllowed.value
    ? serializeBody(bodyMode.value, body.value, form)
    : undefined,
)
const impliedHeaders = computed(() => {
  const implied: Record<string, string> = {}
  const type = contentTypeFor(bodyMode.value)
  if (sentBody.value !== undefined && type) implied['content-type'] = type
  return implied
})
/** Headers as the API gets them, before the session and the tester's marks. */
const effectiveHeaders = computed(() =>
  mergeHeaders(impliedHeaders.value, commonHeaders, headers),
)
const shownImpliedHeaders = computed(() =>
  Object.entries(impliedHeaders.value).filter(
    ([name]) =>
      ![...commonHeaders, ...headers].some(
        (entry) => entry.name.toLowerCase() === name,
      ),
  ),
)
const auth = computed(() =>
  authModeOf(effectiveHeaders.value, useSession.value && loggedIn.value),
)
/** Who the call goes as; an Authorization of the headers for all routes says so. */
const authLabel = computed(() =>
  auth.value === 'manual' &&
  !headers.some((entry) => entry.name.toLowerCase() === 'authorization')
    ? t('api.tester.auth.manual_common')
    : t(`api.tester.auth.${auth.value}`),
)
const request = computed<TesterRequest>(() => ({
  method: method.value,
  headers: effectiveHeaders.value,
  useSession: useSession.value && loggedIn.value,
  ...(sentBody.value !== undefined ? { body: sentBody.value } : {}),
}))

const problem = computed(() =>
  route.value
    ? inputProblem(pathValues, path.value, {
        ...request.value,
        headers: markedHeaders(
          request.value.headers,
          SIZE_PROBE_ID,
          SIZE_PROBE_SOURCE,
        ),
      })
    : null,
)
/** Why Send is off, said next to it. */
const blocker = computed<string | null>(() => {
  if (missingPathParams.value.length)
    return t('api.tester.blocked.path_missing', {
      names: missingPathParams.value.map((name) => `:${name}`).join(', '),
    })
  const value = problem.value
  if (!value) return null
  if (value.code === 'path_value')
    return t('api.tester.blocked.path_value', { name: `:${value.name}` })
  if (value.code === 'header')
    return t('api.tester.blocked.header', { name: value.name })
  return t('api.tester.blocked.too_large', {
    size: formatBytes(value.size, locale.value),
    limit: formatBytes(PROXY_BODY_LIMIT, locale.value),
  })
})

const jsonWarning = computed(() =>
  bodyAllowed.value && bodyMode.value === 'json'
    ? jsonProblem(body.value)
    : null,
)
const formattedBody = computed(() =>
  bodyMode.value === 'json' && body.value.trim() && !jsonWarning.value
    ? formatJson(body.value)
    : null,
)

/** Masked values ([REDACTED]) still in what would be sent. */
const redactedCount = computed(() => {
  const text =
    bodyAllowed.value && ['json', 'text'].includes(bodyMode.value)
      ? body.value
      : ''
  const fields = bodyMode.value === 'form' ? form : []
  return (
    countRedacted(text) +
    [...headers, ...commonHeaders, ...query, ...fields].reduce(
      (count, entry) => count + countRedacted(entry.value),
      0,
    ) +
    Object.values(pathValues).reduce(
      (count, value) => count + countRedacted(value),
      0,
    )
  )
})
const redactedBodyFields = computed(() =>
  ['json', 'text'].includes(bodyMode.value) ? redactedFields(body.value) : [],
)

// --- Tabs ---

const tabs = computed(() => [
  ...(bodyAllowed.value
    ? [{ label: t('api.tester.tabs.body'), value: 'body' }]
    : []),
  {
    label: t('api.tester.tabs.headers'),
    value: 'headers',
    badge:
      [...headers, ...commonHeaders].filter((entry) => entry.name).length ||
      undefined,
  },
  {
    label: t('api.tester.tabs.query'),
    value: 'query',
    badge: query.filter((entry) => entry.name).length || undefined,
  },
])

const bodyModeItems = computed(() =>
  BODY_MODES.map((value) => ({
    label: t(`api.tester.body_modes.${value}`),
    value,
  })),
)

/** Credentials typed among the headers for all routes: every route gets them. */
const commonSecrets = computed(() =>
  commonHeaders
    .filter((entry) => entry.value && isSecretHeader(entry.name))
    .map((entry) => entry.name),
)

/** The key / value lists the open tab edits. */
const editors = computed(() => {
  if (tab.value === 'headers')
    return [
      { key: 'headers', list: headers, add: t('api.tester.add_header') },
      {
        key: 'common',
        list: commonHeaders,
        add: t('api.tester.add_header'),
        title: t('api.tester.common_headers'),
        hint: t('api.tester.common_headers_hint'),
        warning: commonSecrets.value.length
          ? t('api.tester.common_secret', {
              names: commonSecrets.value.join(', '),
            })
          : undefined,
      },
    ]
  if (tab.value === 'query')
    return [{ key: 'query', list: query, add: t('api.tester.add_query') }]
  return [{ key: 'form', list: form, add: t('api.tester.add_field') }]
})

/** False for a route the module leaves out of its logs (the console's own). */
const routeCaptured = computed(() => route.value?.captured !== false)
const capturedAvailable = computed(
  () =>
    routeCaptured.value &&
    !!result.value?.requestId &&
    !neverSent(result.value.error),
)
const responseTabs = computed(() => [
  ...(result.value?.error
    ? []
    : [
        { label: t('api.tester.response'), value: 'body' },
        {
          label: t('api.tester.tabs.headers'),
          value: 'headers',
          badge: Object.keys(result.value?.headers ?? {}).length || undefined,
        },
      ]),
  ...(capturedAvailable.value
    ? [{ label: t('api.tester.tabs.captured'), value: 'captured' }]
    : []),
])

// --- What the line under the body says ---

const bodyHint = computed<{ text: string; tone: 'dimmed' | 'warning' }>(() => {
  const contract = route.value?.contract
  if (bodyMode.value === 'none')
    return { text: t('api.tester.body_hint.none'), tone: 'dimmed' }
  if (origin.value === 'replay' && replayInfo.value) {
    const info = replayInfo.value
    if (info.bodyMissing)
      return {
        text: info.bodyOmitted
          ? t('api.tester.body_hint.replay_missing', {
              reason: t(`api.tester.body_omitted.${info.bodyOmitted}`),
            })
          : t('api.tester.body_hint.replay_missing_unknown'),
        tone: 'warning',
      }
    if (info.bodyTruncated)
      return {
        text:
          problem.value?.code === 'body_too_large'
            ? t('api.tester.body_hint.replay_truncated_too_large', {
                limit: formatBytes(PROXY_BODY_LIMIT, locale.value),
              })
            : t('api.tester.body_hint.replay_truncated'),
        tone: 'warning',
      }
    return {
      text: t('api.tester.body_hint.replay', { id: shortId(info.id) }),
      tone: 'dimmed',
    }
  }
  if (sentBody.value === undefined)
    return { text: t('api.tester.body_hint.empty'), tone: 'dimmed' }
  if (bodyMode.value === 'form')
    return { text: t('api.tester.body_hint.form'), tone: 'dimmed' }
  if (origin.value === 'history')
    return { text: t('api.tester.body_hint.history'), tone: 'dimmed' }
  if (origin.value === 'edited' || !contract)
    return { text: '', tone: 'dimmed' }
  if (contract.exampleBody !== null && contract.exampleBody !== undefined)
    return { text: t('api.tester.body_hint.example'), tone: 'dimmed' }
  const span = { days: contract.windowDays, count: contract.total }
  if (contract.total === 0)
    return { text: t('api.tester.body_hint.no_capture', span), tone: 'dimmed' }
  return {
    text: contract.sampled
      ? t(
          'api.tester.body_hint.no_json',
          { ...span, count: contract.sampled },
          contract.sampled,
        )
      : t('api.tester.body_hint.no_success', span, contract.total),
    tone: 'dimmed',
  }
})

const queryHint = computed(() => {
  const contract = route.value?.contract
  if (!contract) return ''
  if (contract.queryParams.length)
    return t('api.tester.query_known', {
      names: contract.queryParams.join(', '),
    })
  const span = { days: contract.windowDays }
  return contract.total
    ? t('api.tester.query_none', span)
    : t('api.tester.query_no_capture', span)
})

function shortId(id: string): string {
  return id.slice(0, 8)
}

// --- Draft ---

function fill(list: Row[], values: KeyValue[]) {
  list.splice(
    0,
    list.length,
    ...values.map((entry) => row(entry.name, entry.value)),
  )
}

function applyRequest(next: DraftRequest) {
  bodyMode.value = bodyAllowed.value ? next.bodyMode : 'none'
  body.value = next.body
  fill(form, next.form)
  fill(headers, next.headers)
  fill(query, next.query)
  for (const key of Object.keys(pathValues)) delete pathValues[key]
  for (const name of route.value?.pathParams ?? [])
    pathValues[name] = next.pathValues[name] ?? ''
  useSession.value = next.useSession
}

function openFirstTab() {
  tab.value = bodyMode.value !== 'none' ? 'body' : 'headers'
}

/**
 * Says which credentials a restored answer was sent with that the fields no
 * longer hold: never stored, or forgotten on reload.
 */
function warnLostSecrets(sent: string[]) {
  const lost = lostSecrets(sent, [...headers, ...commonHeaders])
  if (lost.length)
    toast.add({
      title: t('api.tester.secrets_not_kept', { names: lost.join(', ') }),
      color: 'warning',
      icon: 'i-ph-key',
    })
}

function resetToExample(clearResult = false) {
  if (!example.value) return
  applyRequest(example.value)
  origin.value = 'example'
  replayInfo.value = null
  if (clearResult) showResult(null)
  openFirstTab()
}

function currentDraft(): TesterDraft | null {
  if (!modified.value && !result.value && !replayInfo.value) return null
  return {
    request: draftRequest.value,
    origin: origin.value,
    replay: replayInfo.value,
    result: result.value,
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let saveRef: string | null = null

function flushDraft() {
  if (saveTimer === undefined || !saveRef) return
  clearTimeout(saveTimer)
  saveTimer = undefined
  saveDraft(saveRef, currentDraft())
}

watch([draftRequest, origin, replayInfo, result], () => {
  if (!activeRef) return
  if (saveTimer !== undefined) clearTimeout(saveTimer)
  saveRef = activeRef
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    if (activeRef && saveRef === activeRef) saveDraft(activeRef, currentDraft())
  }, DRAFT_SAVE_DELAY_MS)
})

watch(commonHeaders, () => saveCommonHeaders(rows(commonHeaders)), {
  deep: true,
})

function loadRoute(next: string) {
  flushDraft()
  if (inFlight && inFlight.ref !== next) {
    inFlight.controller.abort(ROUTE_CHANGED)
    inFlight = null
    sending.value = false
  }
  activeRef = next
  filledRef.value = next
  history.value = loadHistory(next)
  const draft = loadDraft(next)
  if (draft) {
    applyRequest(draft.request)
    origin.value = draft.origin
    replayInfo.value = draft.replay
    showResult(draft.result)
    openFirstTab()
    warnLostSecrets(draft.result?.secrets ?? [])
  } else resetToExample(true)
  const replayId = currentRoute.query.replay
  if (typeof replayId === 'string' && replayId) void replay(replayId, next)
}

onMounted(() =>
  watch(
    () => route.value?.ref,
    (next) => {
      if (next) loadRoute(next)
    },
    { immediate: true },
  ),
)

// --- Replay ---

/** Takes `?replay=` off the URL: a replay is loaded once, on its own route. */
function dropReplayParam() {
  const { replay: _replay, ...rest } = currentRoute.query
  return router.replace({ query: rest })
}

const replayedId = shallowRef<string | null>(null)
const replayRead = useApiData<CapturedRequest>(
  () =>
    replayedId.value
      ? `${LOGS_API}/${encodeURIComponent(replayedId.value)}`
      : null,
  ON_DEMAND,
)

async function replay(id: string, ref: string) {
  void dropReplayParam()
  try {
    replayedId.value = id
    await replayRead.execute()
    if (replayRead.error.value) throw replayRead.error.value
    const log = replayRead.data.value
    if (activeRef !== ref || !log) return
    const capturedRef = log.route
    if (capturedRef !== ref) {
      toast.add({
        title: t('api.tester.replay_other_route', { route: capturedRef }),
        color: 'warning',
        icon: 'i-ph-warning',
      })
      return
    }
    const replayed = replayFrom(log)
    applyRequest({
      bodyMode: replayed.bodyMode,
      body: replayed.body,
      form: [],
      headers: replayed.headers,
      query: replayed.query,
      pathValues: replayed.pathValues,
      useSession: example.value?.useSession ?? true,
    })
    origin.value = 'replay'
    replayInfo.value = {
      id: log._id,
      at: log.timestamp,
      skippedHeaders: replayed.skippedHeaders,
      bodyMissing: replayed.bodyMissing,
      bodyOmitted: replayed.bodyOmitted,
      bodyTruncated: replayed.bodyTruncated,
    }
    showResult(null)
    openFirstTab()
    toast.add({
      title: t('api.tester.replayed'),
      color: 'info',
      icon: 'i-ph-arrow-counter-clockwise',
    })
  } catch (cause) {
    // A request pruned, outside the route scope or matching no route: the
    // logs do not open it.
    const missing = errorStatus(cause) === 404
    toast.add({
      title: t(
        missing ? 'api.tester.replay_not_found' : 'api.tester.replay_failed',
      ),
      color: missing ? 'warning' : 'error',
      icon: 'i-ph-warning',
    })
  }
}

const replayTitle = computed(() => {
  const info = replayInfo.value
  if (!info) return ''
  return [
    t('api.tester.replay_banner.title', {
      id: shortId(info.id),
      at: formatClock(info.at, dateFormat.value),
    }),
    ...(info.skippedHeaders.length
      ? [
          t(
            'api.tester.replay_banner.headers',
            { count: info.skippedHeaders.length },
            info.skippedHeaders.length,
          ),
        ]
      : []),
    ...(redactedCount.value
      ? [
          t(
            'api.tester.replay_banner.redacted',
            { count: redactedCount.value },
            redactedCount.value,
          ),
        ]
      : []),
    ...(info.bodyTruncated ? [t('api.tester.replay_banner.truncated')] : []),
  ].join(' · ')
})
const replayDescription = computed(() => {
  const info = replayInfo.value
  if (!info) return ''
  return info.skippedHeaders.length
    ? t('api.tester.replay_banner.skipped', {
        names: info.skippedHeaders.join(', '),
      })
    : t('api.tester.replay_banner.credentials')
})

// --- Sending ---

async function confirmSend(ref: string): Promise<boolean> {
  const firstWrite = writes.value && !isDelete.value && !hasConfirmedWrite(ref)
  const reasons: string[] = []
  if (isDelete.value)
    reasons.push(t('api.tester.confirm.delete', { path: path.value }))
  else if (firstWrite)
    reasons.push(
      t('api.tester.confirm.write', { method: method.value, path: path.value }),
    )
  if (redactedCount.value)
    reasons.push(
      t(
        'api.tester.confirm.redacted',
        { count: redactedCount.value },
        redactedCount.value,
      ),
    )
  // A body cut at capture, sent untouched: the API gets part of it.
  const truncated =
    origin.value === 'replay' &&
    !!replayInfo.value?.bodyTruncated &&
    sentBody.value !== undefined
  if (truncated) reasons.push(t('api.tester.confirm.truncated'))
  if (reasons.length === 0) return true
  confirming = true
  try {
    const confirmed = await confirm({
      title: isDelete.value
        ? t('api.tester.confirm.delete_title')
        : firstWrite
          ? t('api.tester.confirm.write_title')
          : redactedCount.value
            ? t('api.tester.confirm.redacted_title')
            : t('api.tester.confirm.truncated_title'),
      description: reasons.join(' '),
      color: isDelete.value ? 'error' : 'warning',
      confirmLabel: t('api.tester.send'),
      confirmIcon: 'i-ph-paper-plane-tilt',
      initialFocus: 'cancel',
    })
    if (confirmed && firstWrite) rememberConfirmedWrite(ref)
    return confirmed
  } finally {
    confirming = false
  }
}

async function send() {
  const value = route.value
  if (sending.value || confirming || !value || blocker.value) return
  const ref = value.ref
  if (!(await confirmSend(ref))) return
  if (activeRef !== ref || sending.value) return
  // The signed mark that keeps the call out of the statistics: without it,
  // the call would count as the API's own traffic, so it is not sent.
  let source: string
  try {
    source = (await sourceTokens.get()).value
  } catch {
    toast.add({
      title: t('api.tester.source_failed'),
      color: 'error',
      icon: 'i-ph-warning',
    })
    return
  }
  if (activeRef !== ref || sending.value) return
  const requestId = newRequestId()
  const sentPath = path.value
  const snapshot = draftRequest.value
  const sentAuth = auth.value
  const outgoing: TesterRequest = {
    ...request.value,
    headers: markedHeaders(request.value.headers, requestId, source),
  }
  const controller = new AbortController()
  inFlight = { controller, ref }
  sending.value = true
  const at = Date.now()
  const started = performance.now()
  const sentSecrets = secretNames(outgoing.headers)
  const common = {
    auth: sentAuth,
    ...(sentSecrets.length ? { secrets: sentSecrets } : {}),
    requestId,
    at,
  }
  let outcome: TesterResult
  try {
    const answer = await sendTesterRequest(
      sentPath,
      window.location.origin,
      outgoing,
      controller.signal,
    )
    outcome = {
      ...answer,
      bodySize: byteLength(answer.body),
      durationMs: Math.round(performance.now() - started),
      ...common,
    }
  } catch (cause) {
    outcome = {
      status: 0,
      durationMs: Math.round(performance.now() - started),
      headers: {},
      body: '',
      error: cause instanceof TesterError ? cause.code : 'unexpected',
      message: cause instanceof Error ? cause.message : String(cause),
      ...common,
    }
  }
  if (inFlight?.controller === controller) {
    inFlight = null
    sending.value = false
  }
  // An answer already in hand when the route changed is filed as it came.
  if (controller.signal.reason === ROUTE_CHANGED && outcome.error)
    outcome = { ...outcome, error: 'aborted', abandoned: true }
  commit(ref, value.method, sentPath, snapshot, outcome)
}

function cancel() {
  inFlight?.controller.abort()
}

/**
 * Files a finished call under the route that sent it: its history, and the
 * screen if it still shows that route, else its draft. A call cancelled from
 * the screen stays off the history; one abandoned by a route change is kept,
 * as the API may have received it.
 */
function commit(
  ref: string,
  sentMethod: string,
  sentPath: string,
  snapshot: DraftRequest,
  outcome: TesterResult,
) {
  const shown = !unmounted && activeRef === ref
  if (outcome.error !== 'aborted' || outcome.abandoned) {
    const entry = historyEntry(sentMethod, sentPath, snapshot, outcome)
    const list = [entry, ...(shown ? history.value : loadHistory(ref))].slice(
      0,
      HISTORY_MAX,
    )
    if (shown) history.value = list
    saveHistory(ref, list)
  }
  if (!shown) {
    const draft = loadDraft(ref)
    saveDraft(ref, {
      ...(draft ?? { request: snapshot, origin: 'example', replay: null }),
      result: outcome,
    })
    return
  }
  showResult(outcome, true)
}

// --- What the module captured of the call ---

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function findCaptured(
  read: ReadJson,
  target: TesterResult,
): Promise<CapturedRequest | null> {
  const id = target.requestId as string
  const page = await read<{ results: CapturedRow[] }>(
    `${LOGS_API}?${new URLSearchParams({ requestId: id })}`,
  )
  // Only the call sent: a list that ignored the filter is no answer.
  const matches = page.results.filter((item) =>
    item.requestId === undefined
      ? page.results.length === 1
      : item.requestId === id,
  )
  const found = matches[0]
  if (
    !found ||
    Date.parse(found.timestamp) < target.at - CAPTURE_MATCH_MS ||
    (found.route && activeRef && found.route !== activeRef)
  )
    return null
  return read<CapturedRequest>(`${LOGS_API}/${encodeURIComponent(found._id)}`)
}

const capturedTarget = shallowRef<TesterResult | null>(null)
const captured = useApiData<CapturedRequest | null>(
  () =>
    capturedTarget.value?.requestId
      ? `dms-api:tester-captured:${capturedTarget.value.requestId}`
      : null,
  ({ $authFetch, signal }) =>
    findCaptured(
      (url) => $authFetch(url, { signal }),
      capturedTarget.value as TesterResult,
    ),
  ON_DEMAND,
)

async function lookUpCaptured(target: TesterResult, retry: boolean) {
  const id = target.requestId
  if (!id) return
  capturedState.value = 'loading'
  const current = () =>
    result.value?.requestId === id && capturedTarget.value?.requestId === id
  for (const delay of retry ? CAPTURE_DELAYS_MS : [0]) {
    if (delay) await wait(delay)
    if (result.value?.requestId !== id) return
    capturedTarget.value = target
    await captured.execute()
    if (!current()) return
    if (captured.error.value) {
      capturedState.value = 'error'
      return
    }
    const log = captured.data.value
    if (log) {
      capturedLog.value = log
      capturedState.value = 'found'
      keepCaptured(id, log)
      return
    }
  }
  capturedState.value = 'missing'
}

/**
 * Keeps what the module captured of a call with its answer, on screen, in
 * the draft and in the history: its server time and its record survive a
 * return to the route. A 502 of the proxy for a call the module captured is
 * the API answering more than the proxy returns.
 */
function keepCaptured(id: string, log: CapturedRequest) {
  const value = result.value
  if (value?.requestId !== id) return
  if (value.captured && value.error !== 'proxy_failed') return
  const patch: Partial<TesterResult> = {
    captured: capturedSummary(log),
    ...(value.error === 'proxy_failed'
      ? { error: 'response_too_large' as const }
      : {}),
  }
  result.value = { ...value, ...patch }
  if (!activeRef) return
  history.value = patchResult(history.value, id, patch)
  saveHistory(activeRef, history.value)
}

/**
 * Shows an answer, on its Captured tab when it failed. What the module
 * captured is looked up for a call just made, for an answer restored before
 * it was found (its server time and record), and when that tab is open.
 */
function showResult(value: TesterResult | null, fresh = false) {
  result.value = value
  capturedState.value = 'idle'
  capturedLog.value = null
  responseTab.value =
    value?.error && capturedAvailable.value ? 'captured' : 'body'
  if (
    value &&
    capturedAvailable.value &&
    (fresh || responseTab.value === 'captured' || !value.captured)
  )
    void lookUpCaptured(value, fresh)
}

watch(responseTab, (value) => {
  if (value === 'captured' && capturedState.value === 'idle' && result.value)
    void lookUpCaptured(result.value, false)
})

const capturedSlow = computed(() => !!result.value?.captured?.slow)

// --- History ---

function restore(entry: HistoryEntry) {
  applyRequest(entry.request)
  origin.value = 'history'
  replayInfo.value = null
  showResult(entry.result)
  warnLostSecrets([
    ...(entry.secretsRemoved ?? []),
    ...(entry.result.secrets ?? []),
  ])
}

function clearHistory() {
  const ref = activeRef
  if (!ref) return
  const cleared = history.value
  history.value = []
  saveHistory(ref, [])
  toast.add({
    title: t(
      'api.tester.history_cleared',
      { count: cleared.length },
      cleared.length,
    ),
    color: 'neutral',
    icon: 'i-ph-trash',
    actions: [
      {
        label: t('api.tester.undo'),
        color: 'neutral',
        variant: 'outline',
        onClick: () => {
          const merged = [...loadHistory(ref), ...cleared].slice(0, HISTORY_MAX)
          saveHistory(ref, merged)
          if (activeRef === ref) history.value = merged
        },
      },
    ],
  })
}

// --- Copy cURL ---

function curl(): string {
  const search: Record<string, string | string[]> = {}
  for (const { name, value } of query) {
    if (!name) continue
    const known = search[name]
    search[name] = known === undefined ? value : [...[known].flat(), value]
  }
  return toCurl({
    method: method.value,
    path: route.value?.path ?? '/',
    origin: apiOrigin.value,
    pathParams: { ...pathValues },
    query: search,
    headers: effectiveHeaders.value,
    body: sentBody.value,
    session: auth.value === 'session',
  })
}

async function copyCurl() {
  try {
    await navigator.clipboard.writeText(curl())
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

/** What the user typed in the body editor (not a body loaded into it). */
function editBody(value: string | null | undefined) {
  const next = value ?? ''
  if (next === body.value) return
  body.value = next
  origin.value = 'edited'
}

function formatBody() {
  if (formattedBody.value === null) return
  body.value = formattedBody.value
  origin.value = 'edited'
}

// --- Keyboard ---

/**
 * Ctrl/Cmd+Enter sends from a field of the tester only, never from the rest
 * of the page (the route filter, the command palette); `send` still asks
 * before a write it has not confirmed.
 */
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
  if (event.isComposing) return
  event.preventDefault()
  void send()
}

// --- Live hold ---

const FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]'
const live = usePageLive()

function onFocusIn(event: FocusEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest(FIELD_SELECTOR))
    live.hold('$api.live_mode.typing_in_tester')
}

// Held while the focus stays in the Tester (a field, Send), released once it
// leaves; the DMS releases it with the component too.
function onFocusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement
  const next = event.relatedTarget as Node | null
  if (next && root.contains(next)) return
  live.release()
}

onBeforeUnmount(() => {
  flushDraft()
  // A call in flight still lands in its route's history and draft.
  unmounted = true
})

// --- Answer ---

const responseBody = computed(() => prettyBody(result.value?.body))
const responseSize = computed(() =>
  result.value ? (result.value.bodySize ?? byteLength(result.value.body)) : 0,
)
function recordLink(id: string): string {
  return `${LOGS_PAGE}?${new URLSearchParams({ record: id })}`
}

/** A path as it reads: decoded, its bidirectional controls shown. */
function readable(value: string): string {
  try {
    return revealBidi(decodeURI(value))
  } catch {
    return revealBidi(value)
  }
}

/**
 * The captured call, else the route's logs: only for a route the module
 * captures and the active scope shows (the logs list is scoped).
 */
const logsLink = computed(() => {
  const id = result.value?.captured?.id
  if (id) return recordLink(id)
  return route.value && routeCaptured.value && route.value.inScope !== false
    ? `${LOGS_PAGE}?${new URLSearchParams({ route: route.value.ref })}`
    : ''
})
const errorCopy = computed(() => {
  const value = result.value
  if (!value?.error) return null
  const code = value.abandoned ? 'abandoned' : value.error
  const params = {
    limit: formatBytes(PROXY_RESPONSE_LIMIT, locale.value),
    seconds: PROXY_TIMEOUT_MS / 1000,
    status: value.captured?.status ?? '',
    message: value.message ?? '',
  }
  const description =
    !routeCaptured.value && POINTS_TO_CAPTURED.has(code)
      ? 'description_uncaptured'
      : 'description'
  return {
    title: t(`api.tester.errors.${code}.title`, params),
    description: t(`api.tester.errors.${code}.${description}`, params),
    icon: ERROR_ICONS[value.error] ?? 'i-ph-plugs',
  }
})
const liveMessage = computed(() => {
  const value = result.value
  if (sending.value || !value) return ''
  if (errorCopy.value)
    return t('api.tester.live.failed', { title: errorCopy.value.title })
  return t('api.tester.live.sent', {
    status: value.status,
    text: statusText(value.status),
    duration: formatMs(value.durationMs, locale.value),
  })
})
const shortcut = computed(() =>
  typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl',
)
</script>

<template>
  <div v-if="!selection.ref.value" />
  <USkeleton v-else-if="pending || (route && !filledRef)" class="h-72" />
  <div
    v-else-if="route"
    class="flex flex-col gap-4"
    @keydown.capture="onKey"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <DmsCard :padded="false">
      <!-- The method and the path keep a line of their own when the card is
           narrow: the buttons go under them, and a long path wraps. -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <div class="flex min-w-0 grow basis-80 items-center gap-3">
          <ApiMethodBadge :method="route.method" solid class="shrink-0" />
          <div
            class="text-highlighted flex min-w-0 grow flex-wrap items-center gap-y-1 font-mono text-[13px]"
            :title="readable(path)"
          >
            <template v-for="(segment, index) in segments" :key="index">
              <input
                v-if="segment.param"
                v-model="pathValues[segment.name]"
                type="text"
                spellcheck="false"
                :placeholder="segment.text"
                :aria-label="t('api.tester.path_param', { name: segment.text })"
                :aria-invalid="!pathValues[segment.name]"
                :title="
                  hasRedacted(pathValues[segment.name])
                    ? t('api.tester.redacted_value')
                    : undefined
                "
                class="bg-elevated focus:ring-primary mx-0.5 min-w-[4ch] max-w-full rounded px-1 py-0.5 outline-none focus:ring-2"
                :class="
                  !pathValues[segment.name]
                    ? 'ring-error/60 placeholder:text-error/70 ring-1'
                    : hasRedacted(pathValues[segment.name])
                      ? 'ring-warning ring-1'
                      : ''
                "
                :style="{
                  width: `${Math.min(28, Math.max(segment.text.length, (pathValues[segment.name] ?? '').length) + 2)}ch`,
                }"
              />
              <span v-else class="min-w-0 break-all">{{ segment.text }}</span>
            </template>
            <span v-if="displayQuery" class="text-muted min-w-0 break-all">
              {{ displayQuery }}
            </span>
          </div>
        </div>
        <div class="ms-auto flex flex-wrap items-center justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-ph-terminal"
            :label="t('api.request.copy_curl')"
            @click="copyCurl"
          />
          <UButton
            v-if="sending"
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-ph-x"
            :label="t('dms.confirm.cancel')"
            @click="cancel"
          />
          <UButton
            size="sm"
            icon="i-ph-paper-plane-tilt"
            :loading="sending"
            :disabled="!!blocker"
            :label="t('api.tester.send')"
            aria-keyshortcuts="Control+Enter Meta+Enter"
            :aria-describedby="blocker ? blockerId : undefined"
            @click="send"
          >
            <template #trailing>
              <span class="hidden gap-0.5 sm:flex" aria-hidden="true">
                <UKbd :value="shortcut" size="sm" />
                <UKbd value="↵" size="sm" />
              </span>
            </template>
          </UButton>
        </div>
      </div>
      <div
        class="border-default flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2.5 text-[12.5px]"
      >
        <label class="flex cursor-pointer items-center gap-2">
          <USwitch v-model="useSession" size="sm" :disabled="!loggedIn" />
          <span class="text-default">{{ t('api.tester.session') }}</span>
        </label>
        <span
          class="inline-flex items-center gap-1"
          :class="auth === 'manual' ? 'text-warning' : 'text-dimmed'"
        >
          <UIcon :name="AUTH_ICONS[auth]" class="size-3.5 shrink-0" />
          {{ authLabel }}
        </span>
        <span class="grow" />
        <span
          v-if="blocker"
          :id="blockerId"
          class="text-error inline-flex items-center gap-1"
        >
          <UIcon name="i-ph-warning-circle" class="size-3.5 shrink-0" />
          {{ blocker }}
        </span>
        <!-- The trigger is a plain element: the DMS components load
             asynchronously, and a tooltip anchored on one still loading
             reads an element it does not have yet (a direct load of the
             tab crashed on it). -->
        <UTooltip v-if="writes" :text="t('api.tester.writes_hint')">
          <span class="inline-flex rounded-full" tabindex="0">
            <DmsStatusPill
              tone="warning"
              icon="i-ph-warning"
              :mono="false"
              :label="t('api.tester.writes')"
            />
          </span>
        </UTooltip>
      </div>
      <div v-if="replayInfo" class="border-default border-t px-4 py-2.5">
        <DmsBanner
          tone="info"
          size="sm"
          icon="i-ph-arrow-counter-clockwise"
          :title="replayTitle"
          :description="replayDescription"
          dismissible
          @dismiss="replayInfo = null"
        >
          <template #actions>
            <UButton
              :to="recordLink(replayInfo.id)"
              size="xs"
              color="neutral"
              variant="outline"
              :label="t('api.tester.replay_banner.open')"
            />
          </template>
        </DmsBanner>
      </div>
    </DmsCard>

    <div class="grid gap-4 xl:grid-cols-2 xl:items-start">
      <DmsCard :padded="false" class="@container min-w-0">
        <div
          class="border-default flex flex-wrap items-center gap-x-2 border-b px-3"
        >
          <!-- overflow-x-auto alone turns overflow-y to auto: the active
               tab's underline would show a scrollbar. -->
          <UTabs
            v-model="tab"
            :items="tabs"
            :content="false"
            variant="link"
            size="sm"
            class="min-w-0 grow overflow-x-auto overflow-y-hidden"
          />
          <template v-if="modified">
            <span class="text-dimmed inline-flex items-center gap-1.5 text-xs">
              <span
                class="bg-warning size-1.5 rounded-full"
                aria-hidden="true"
              />
              {{ t('api.tester.draft_modified') }}
            </span>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-ph-arrow-counter-clockwise"
              :label="t('api.tester.reset')"
              @click="resetToExample()"
            />
          </template>
        </div>
        <div class="p-3">
          <div
            v-if="tab === 'body' && bodyAllowed"
            class="mb-2 flex flex-wrap items-center gap-2"
          >
            <USelect
              v-model="bodyMode"
              :items="bodyModeItems"
              size="xs"
              class="w-36"
              :aria-label="t('api.tester.body_mode')"
            />
            <span class="grow" />
            <UButton
              v-if="bodyMode === 'json'"
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-ph-brackets-curly"
              :disabled="formattedBody === null || formattedBody === body"
              :label="t('api.tester.format')"
              @click="formatBody"
            />
          </div>

          <template
            v-if="
              tab === 'body' &&
              bodyAllowed &&
              (bodyMode === 'json' || bodyMode === 'text')
            "
          >
            <DmsInputCode
              :key="bodyMode"
              :model-value="body"
              :language="bodyMode === 'json' ? 'json' : 'text'"
              :min-lines="12"
              :max-lines="24"
              :aria-describedby="bodyHintId"
              @update:model-value="editBody"
            />
          </template>

          <div
            v-else-if="tab !== 'body' || (bodyAllowed && bodyMode === 'form')"
            class="flex flex-col gap-4"
          >
            <div
              v-if="tab === 'headers' && shownImpliedHeaders.length"
              class="text-dimmed flex flex-col gap-1 font-mono text-xs"
            >
              <span v-for="[name, value] in shownImpliedHeaders" :key="name">
                {{ name }}: {{ value }}
                <span class="font-sans">
                  · {{ t('api.tester.implied_header') }}
                </span>
              </span>
            </div>
            <div
              v-for="editor in editors"
              :key="editor.key"
              class="@sm:gap-2 flex flex-col gap-3"
            >
              <p
                v-if="editor.title"
                class="text-default border-default border-t pt-3 text-xs font-medium"
              >
                {{ editor.title }}
              </p>
              <!-- In a narrow card the name takes a line of its own, the
                   value and its button the next: a name is never cut. -->
              <div
                v-for="(entry, index) in editor.list"
                :key="entry.id"
                class="@sm:flex-nowrap flex flex-wrap gap-2"
              >
                <UInput
                  v-model="entry.name"
                  size="sm"
                  class="@sm:w-2/5 w-full font-mono"
                  :placeholder="t('dms.form.key_value.key')"
                  :aria-label="t('dms.form.key_value.key')"
                />
                <UInput
                  v-model="entry.value"
                  size="sm"
                  class="min-w-0 flex-1 font-mono"
                  :placeholder="t('dms.form.key_value.value')"
                  :aria-label="t('dms.form.key_value.value')"
                  :color="hasRedacted(entry.value) ? 'warning' : undefined"
                  :highlight="hasRedacted(entry.value)"
                  :title="
                    hasRedacted(entry.value)
                      ? t('api.tester.redacted_value')
                      : undefined
                  "
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-ph-x"
                  :aria-label="t('api.tester.remove')"
                  @click="editor.list.splice(index, 1)"
                />
              </div>
              <div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-ph-plus"
                  :label="editor.add"
                  @click="editor.list.push(row())"
                />
              </div>
              <p v-if="editor.hint" class="text-dimmed text-xs">
                {{ editor.hint }}
              </p>
              <p
                v-if="editor.warning"
                class="text-warning inline-flex items-start gap-1 text-xs"
              >
                <UIcon name="i-ph-key" class="mt-px size-3.5 shrink-0" />
                {{ editor.warning }}
              </p>
            </div>
            <p v-if="tab !== 'body'" class="text-dimmed text-xs">
              <template v-if="tab === 'headers'">
                {{ t('api.tester.headers_hint') }}
                {{ t('api.tester.marks_hint') }}
              </template>
              <template v-else-if="tab === 'query'">{{ queryHint }}</template>
            </p>
          </div>

          <template v-if="tab === 'body' && bodyAllowed">
            <p v-if="jsonWarning" class="text-warning mt-1.5 text-xs">
              {{ t('api.tester.json_warning', { message: jsonWarning }) }}
            </p>
            <p
              v-if="redactedBodyFields.length"
              class="text-warning mt-1.5 text-xs"
            >
              {{
                t(
                  'api.tester.body_redacted',
                  {
                    count: redactedBodyFields.length,
                    names: redactedBodyFields.join(', '),
                  },
                  redactedBodyFields.length,
                )
              }}
            </p>
            <p
              v-if="bodyHint.text"
              :id="bodyHintId"
              class="mt-1.5 text-xs"
              :class="
                bodyHint.tone === 'warning' ? 'text-warning' : 'text-dimmed'
              "
            >
              {{ bodyHint.text }}
            </p>
          </template>
        </div>
      </DmsCard>

      <DmsCard :padded="false" class="min-w-0">
        <div v-if="!result" class="px-4 py-10">
          <DmsEmptyState
            size="sm"
            :icon="sending ? 'i-ph-hourglass-medium' : 'i-ph-paper-plane-tilt'"
            :title="
              sending
                ? t('api.tester.waiting_title')
                : t('api.tester.no_response_title')
            "
            :description="
              sending
                ? t('api.tester.waiting_description', {
                    seconds: PROXY_TIMEOUT_MS / 1000,
                  })
                : t('api.tester.no_response_description', { shortcut })
            "
          />
        </div>
        <template v-else>
          <div
            class="border-default flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5"
          >
            <ApiStatusBadge v-if="result.status" :status="result.status" text />
            <DmsStatusPill
              v-else
              :tone="result.error === 'aborted' ? 'neutral' : 'error'"
              dot="none"
              :label="
                result.error === 'aborted'
                  ? t('api.tester.cancelled')
                  : t('api.tester.failed')
              "
            />
            <UTooltip :text="t('api.tester.duration_tooltip')">
              <span class="text-muted font-mono text-[12px]" tabindex="0">
                {{
                  t('api.tester.duration_browser', {
                    duration: formatMs(result.durationMs, locale),
                  })
                }}
                <template
                  v-if="
                    result.captured && result.captured.responseTimeMs !== null
                  "
                >
                  ·
                  <span
                    :class="capturedSlow ? 'text-warning font-semibold' : ''"
                  >
                    {{
                      t('api.tester.duration_server', {
                        duration: formatMs(
                          result.captured.responseTimeMs,
                          locale,
                        ),
                      })
                    }}
                  </span>
                </template>
              </span>
            </UTooltip>
            <span
              v-if="result.body || result.bodySize"
              class="text-muted font-mono text-[12px]"
            >
              {{ formatBytes(responseSize, locale) }}
            </span>
            <span class="grow" />
            <UButton
              v-if="!neverSent(result.error) && logsLink"
              :to="logsLink"
              size="xs"
              variant="link"
              trailing-icon="i-ph-arrow-right"
              :label="
                result.captured
                  ? t('api.tester.open_captured')
                  : t('api.tester.open_logs')
              "
            />
            <UTooltip
              v-else-if="!routeCaptured"
              :text="t('api.tester.not_captured_hint')"
            >
              <span class="text-dimmed text-xs" tabindex="0">
                {{ t('api.tester.not_captured') }}
              </span>
            </UTooltip>
          </div>
          <div class="flex flex-col gap-2 p-3">
            <DmsBanner
              v-if="errorCopy"
              :tone="result.error === 'aborted' ? 'info' : 'error'"
              size="sm"
              :icon="errorCopy.icon"
              :title="errorCopy.title"
              :description="errorCopy.description"
            />
            <DmsBanner
              v-else-if="result.status === 401"
              tone="warning"
              size="sm"
              icon="i-ph-lock-simple"
              :title="t('api.tester.unauthorized_title')"
              :description="t(`api.tester.unauthorized.${result.auth}`)"
            >
              <template v-if="result.auth === 'none'" #actions>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :label="t('api.tester.turn_on_session')"
                  @click="useSession = true"
                />
              </template>
            </DmsBanner>
            <UTabs
              v-if="responseTabs.length"
              v-model="responseTab"
              :items="responseTabs"
              :content="false"
              variant="link"
              size="sm"
            />
            <template v-if="responseTab === 'captured' && capturedAvailable">
              <p
                v-if="capturedState === 'loading' || capturedState === 'idle'"
                class="text-dimmed text-sm"
              >
                {{ t('api.tester.captured.loading') }}
              </p>
              <p
                v-else-if="capturedState === 'missing'"
                class="text-dimmed text-sm"
              >
                {{
                  t('api.tester.captured.missing', {
                    id: shortId(result.requestId ?? ''),
                  })
                }}
              </p>
              <p
                v-else-if="capturedState === 'error'"
                class="text-error text-sm"
              >
                {{ t('api.tester.captured.error') }}
              </p>
              <div v-else-if="capturedLog" class="flex flex-col gap-3">
                <div
                  class="text-muted flex flex-wrap items-center gap-3 font-mono text-[12px]"
                >
                  <ApiStatusBadge
                    :status="capturedLog.statusCode"
                    text
                    size="sm"
                  />
                  <span
                    v-if="capturedLog.responseTimeMs !== null"
                    :class="capturedSlow ? 'text-warning font-semibold' : ''"
                  >
                    {{
                      t('api.tester.duration_server', {
                        duration: formatMs(capturedLog.responseTimeMs, locale),
                      })
                    }}
                  </span>
                  <span>
                    {{ formatClock(capturedLog.timestamp, dateFormat) }}
                  </span>
                  <span>{{ shortId(capturedLog._id) }}</span>
                </div>
                <DmsBanner
                  v-if="capturedLog.error"
                  tone="error"
                  size="sm"
                  icon="i-ph-bug"
                  :title="capturedLog.error.message"
                />
                <DmsCodeSnippet
                  v-if="capturedLog.error?.stack"
                  :code="capturedLog.error.stack"
                  :title="t('api.tester.captured.stack')"
                  max-height="12rem"
                  wrap="anywhere"
                />
                <div class="flex flex-col gap-1.5">
                  <p class="text-default text-xs font-medium">
                    {{ t('api.tester.captured.headers') }}
                  </p>
                  <ApiKeyValues
                    :values="capturedLog.requestHeaders"
                    :empty="t('api.request.no_headers')"
                  />
                </div>
                <DmsCodeSnippet
                  v-if="capturedLog.requestBody"
                  :code="prettyBody(capturedLog.requestBody).text"
                  :title="t('api.tester.captured.body')"
                  max-height="16rem"
                  wrap="anywhere"
                />
                <p
                  v-else-if="capturedLog.requestBodyOmitted"
                  class="text-dimmed text-xs"
                >
                  {{
                    t('api.tester.captured.body_omitted', {
                      reason: t(
                        `api.tester.body_omitted.${capturedLog.requestBodyOmitted}`,
                      ),
                    })
                  }}
                </p>
              </div>
            </template>
            <template v-else-if="!result.error">
              <template v-if="responseTab === 'body'">
                <DmsCodeSnippet
                  v-if="responseBody.text"
                  :code="responseBody.text"
                  max-height="24rem"
                  wrap="anywhere"
                />
                <p v-else class="text-dimmed text-sm">
                  {{ t('api.request.no_body') }}
                </p>
                <p v-if="result.bodyTruncated" class="text-warning text-xs">
                  {{
                    t('api.tester.truncated_in_history', {
                      shown: formatBytes(byteLength(result.body), locale),
                      size: formatBytes(responseSize, locale),
                    })
                  }}
                </p>
              </template>
              <ApiKeyValues
                v-else
                :values="result.headers"
                :empty="t('api.request.no_headers')"
              />
            </template>
          </div>
        </template>
      </DmsCard>
    </div>

    <DmsCard :title="t('api.tester.history')" :padded="false">
      <template #actions>
        <span class="text-dimmed text-xs">
          {{ t('api.tester.history_hint') }}
        </span>
        <UButton
          v-if="history.length"
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('api.tester.clear')"
          @click="clearHistory"
        />
      </template>
      <p v-if="history.length === 0" class="text-dimmed px-4 py-4 text-sm">
        {{ t('api.tester.history_empty') }}
      </p>
      <ul v-else class="divide-default divide-y">
        <li v-for="entry in history" :key="entry.at">
          <button
            type="button"
            class="hover:bg-elevated flex w-full items-center gap-3 px-4 py-2 text-left text-[12.5px]"
            @click="restore(entry)"
          >
            <ApiMethodBadge :method="entry.method" size="sm" />
            <ApiStatusBadge
              v-if="entry.result.status"
              :status="entry.result.status"
              size="sm"
            />
            <DmsStatusPill
              v-else
              :tone="entry.result.error === 'aborted' ? 'neutral' : 'error'"
              dot="none"
              size="sm"
              :label="
                entry.result.error === 'aborted'
                  ? t('api.tester.cancelled')
                  : t('api.tester.failed')
              "
            />
            <span class="text-default min-w-0 grow truncate font-mono">
              {{ readable(entry.path) }}
            </span>
            <span
              v-if="entry.result.abandoned"
              class="text-dimmed shrink-0 text-xs"
            >
              {{ t('api.tester.history_abandoned') }}
            </span>
            <span
              v-if="entry.result.auth !== 'session'"
              class="text-dimmed text-xs"
            >
              {{ t(`api.tester.auth_short.${entry.result.auth}`) }}
            </span>
            <span
              v-if="entry.result.bodySize"
              class="text-dimmed font-mono text-[11px]"
            >
              {{ formatBytes(entry.result.bodySize, locale) }}
            </span>
            <span class="text-muted font-mono text-[11px]">
              {{ formatMs(entry.result.durationMs, locale) }}
            </span>
            <span class="text-dimmed font-mono text-[11px]">
              {{ formatClock(entry.at, dateFormat) }}
            </span>
          </button>
        </li>
      </ul>
    </DmsCard>
    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
  </div>
</template>
