<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatCount } from '../../utils/format'
import {
  bySeverity,
  groupRoutes,
  initialRoute,
  lastRoute,
  listedFolders,
  needsAttention,
  optionId,
  rememberRoute,
  type RouteState,
  stepFrom,
  windowParts,
} from '../../utils/routeExplorer'
import { closestMatch } from '../../utils/search'
import ApiMethodBadge from '../internal/ApiMethodBadge.vue'
import ApiPath from '../internal/ApiPath.vue'

// Every route in scope, grouped by folder, with its traffic and health over
// the health window the list states. The selection is the page's `?route=`,
// so the rest of the page follows it and it survives a reload.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    fetchUrl: string
    queryKey?: string
    /** The live feed (`LIVE_REQUESTS_TOPIC`): the list is read again on it. */
    realtimeTopic?: string
    /**
     * Anchor of the route's header (`RouteHeader`), its key path on the
     * page: a route chosen on a phone, where the detail sits below the list,
     * brings it into view.
     */
    detailBlock?: string
  }>(),
  {
    queryKey: 'route',
  },
)

interface RouteRow {
  ref: string
  method: string
  path: string
  folder: string
  controller: string | null
  handler: string
  requests: number
  state: RouteState
}

const METHOD_FILTERS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
/** A shape per issue, so slow and a high 4xx rate never read alike. */
const STATE_ICON: Partial<Record<RouteState, { name: string; class: string }>> =
  {
    failing: { name: 'i-ph-x-circle-fill', class: 'text-error' },
    slow: { name: 'i-ph-timer-bold', class: 'text-warning' },
    'client-errors': { name: 'i-ph-warning-fill', class: 'text-warning' },
    recovered: {
      name: 'i-ph-arrow-counter-clockwise-bold',
      class: 'text-info',
    },
  }
const STATE_DOT: Record<RouteState, string> = {
  failing: 'bg-error',
  slow: 'bg-warning',
  'client-errors': 'bg-warning',
  recovered: 'bg-info',
  healthy: 'bg-success',
  idle: 'bg-(--ui-border-accented)',
}
/** Rest after the last ↑ / ↓ before the page loads the route reached. */
const KEYBOARD_SETTLE_MS = 150
const REVEAL_MARGIN_PX = 8

const { t } = useI18n()
const { formatLocale: locale, formatNumber } = useRegionalFormat({
  locale: 'format',
})
const selection = useRouteSelection(props.queryKey)
const { data, error, pending, refresh } = useApiData<{
  routes: RouteRow[]
  /** Minutes of traffic each state is judged on. */
  healthWindowMinutes?: number
  /** Minutes of traffic each request count covers. */
  requestsWindowMinutes?: number
}>(() => props.fetchUrl, { refreshOnPageRefresh: false })

// Live, the states and counts are read again in place, at the page's pace:
// the list keeps its order, its scroll and the focus.
usePageLiveRefresh(() => void refresh(), { realtimeTopic: props.realtimeTopic })

const search = ref('')
const method = ref('all')
const onlyAttention = ref(false)
const hideIdle = ref(false)
const collapsed = ref<Set<string>>(new Set())
// Open while nothing is selected; once a route is, the stacked layout folds
// the list to its header so the detail comes first.
const listOpen = ref(!selection.ref.value)
/** The route the keyboard asked for, until the page has loaded it. */
const cursor = ref<string | null>(null)
let settle: ReturnType<typeof setTimeout> | null = null
const searchInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
const scroller = ref<HTMLElement | null>(null)
const tree = ref<HTMLElement | null>(null)
/** The fold toggle, shown only while the list sits above the detail. */
const foldToggle = ref<HTMLButtonElement | null>(null)

const routes = computed(() => data.value?.routes ?? [])
const attentionCount = computed(
  () => routes.value.filter(needsAttention).length,
)
const idleCount = computed(
  () => routes.value.filter((route) => route.state === 'idle').length,
)
const indexOf = computed(
  () => new Map(routes.value.map((route, index) => [route.ref, index])),
)
const folderOf = computed(() => listedFolders(routes.value))

/** The listed route the URL names. */
const selected = computed(() => {
  const current = selection.ref.value
  if (!current) return null
  return routes.value.find((route) => route.ref === current) ?? null
})
const active = computed(() => cursor.value ?? selected.value?.ref ?? null)
const activeId = computed(() => {
  const index = active.value ? indexOf.value.get(active.value) : undefined
  return index === undefined ? undefined : optionId(index)
})

function windowLabel(minutes: number | undefined) {
  if (!minutes) return null
  const { unit, amount } = windowParts(minutes)
  return t(`api.routes.window.${unit}`, { amount })
}
const healthWindow = computed(() =>
  windowLabel(data.value?.healthWindowMinutes),
)
const requestsWindow = computed(() =>
  windowLabel(data.value?.requestsWindowMinutes),
)

const methodItems = computed(() => [
  { label: t('api.routes.tree.all'), value: 'all' },
  ...METHOD_FILTERS.map((value) => ({
    label: value === 'DELETE' ? 'DEL' : value,
    value,
  })),
])

const visible = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return routes.value.filter(
    (route) =>
      (method.value === 'all' || route.method === method.value) &&
      (!onlyAttention.value || needsAttention(route)) &&
      (!hideIdle.value || route.state !== 'idle') &&
      (!needle ||
        route.path.toLowerCase().includes(needle) ||
        route.handler.toLowerCase().includes(needle) ||
        (route.controller ?? '').toLowerCase().includes(needle)),
  )
})

// Needing attention, the list is flat and worst first, like the Overview.
const flatMode = computed(() => onlyAttention.value)
const folders = computed(() => groupRoutes(visible.value, folderOf.value))
const flat = computed(() =>
  flatMode.value
    ? bySeverity(visible.value)
    : folders.value.flatMap((folder) =>
        collapsed.value.has(folder.path) ? [] : folder.routes,
      ),
)
/** What the list draws: its folders, or one flat run worst first. */
const sections = computed(() =>
  flatMode.value
    ? [{ path: null, routes: flat.value, worst: 'idle' as RouteState }]
    : folders.value,
)
const allCollapsed = computed(
  () =>
    folders.value.length > 0 &&
    folders.value.every((folder) => collapsed.value.has(folder.path)),
)

const suggestion = computed(() =>
  search.value.trim() && visible.value.length === 0
    ? closestMatch(
        search.value.trim(),
        routes.value.map((route) => route.path),
      )
    : null,
)

function stateLabel(state: RouteState) {
  return t(`api.routes.state.${state.replace('-', '_')}`)
}

function requestsLabel(route: RouteRow) {
  const count = formatCount(route.requests, locale.value)
  return requestsWindow.value
    ? t('api.routes.tree.requests_window', {
        count,
        window: requestsWindow.value,
      })
    : t('api.routes.tree.requests', { count })
}

function toggleFolder(path: string) {
  const next = new Set(collapsed.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsed.value = next
}

function toggleAll() {
  collapsed.value = allCollapsed.value
    ? new Set()
    : new Set(folders.value.map((folder) => folder.path))
}

function stopSettling() {
  if (settle) clearTimeout(settle)
  settle = null
}

/**
 * Scrolls the list, and only the list, until the active route shows: to the
 * nearest edge as the keyboard walks, in the middle on arrival so the route
 * reads with what surrounds it.
 */
function revealActive(center = false) {
  const container = scroller.value
  if (!container || !active.value) return
  const row = container.querySelector<HTMLElement>(
    `[data-route="${CSS.escape(active.value)}"]`,
  )
  if (!row) return
  const top = row.offsetTop
  const bottom = top + row.offsetHeight
  const above = top < container.scrollTop
  const below = bottom > container.scrollTop + container.clientHeight
  if (!above && !below) return
  if (center) {
    container.scrollTop = top - (container.clientHeight - row.offsetHeight) / 2
  } else if (above) {
    container.scrollTop = top - REVEAL_MARGIN_PX
  } else {
    container.scrollTop = bottom - container.clientHeight + REVEAL_MARGIN_PX
  }
}

/** A route clicked: a history entry, and on a phone the detail comes up. */
async function choose(route: RouteRow) {
  stopSettling()
  cursor.value = null
  await selection.select(route.ref)
  // Beside the detail the list stays; stacked above it, it folds away.
  if (!foldToggle.value?.checkVisibility()) return
  listOpen.value = false
  if (!props.detailBlock) return
  await nextTick()
  scrollToBlock(props.detailBlock, { block: 'start', behavior: 'smooth' })
}

/**
 * ↑ / ↓ walk the list at once and load the route reached once the keys rest,
 * replacing the history entry: Back then leaves the page.
 */
async function move(step: number) {
  const next = stepFrom(flat.value, active.value, step)
  if (!next) return
  cursor.value = next.ref
  await nextTick()
  revealActive()
  stopSettling()
  settle = setTimeout(() => {
    settle = null
    void selection.select(next.ref, { replace: true })
  }, KEYBOARD_SETTLE_MS)
}

function clearFilters() {
  search.value = ''
  method.value = 'all'
  onlyAttention.value = false
  hideIdle.value = false
}

// "/" opens the filter, as the request logs open their search; listed on
// the DMS Shortcuts page (`app/config/shortcuts-registry.ts`). Like every
// `defineShortcuts` key, it does not fire while the user types in a field.
defineShortcuts({
  '/': () => {
    listOpen.value = true
    void nextTick(() => searchInput.value?.inputRef?.focus())
  },
})

function onListKey(event: KeyboardEvent) {
  const length = flat.value.length
  const steps: Record<string, number> = {
    ArrowDown: 1,
    ArrowUp: -1,
    Home: -length,
    End: length,
  }
  const step = steps[event.key]
  if (step === undefined) return
  event.preventDefault()
  void move(step)
}

/** ↓ from the filter goes down into the list; Enter opens the first match. */
function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    tree.value?.focus()
    void move(1)
  } else if (event.key === 'Enter' && flat.value[0]) {
    event.preventDefault()
    void choose(flat.value[0])
  }
}

onBeforeUnmount(stopSettling)

// A page opened without a route shows the last one looked at in this tab,
// else the one needing a look first, without a history entry of its own,
// over the module's last period.
watch(
  routes,
  (all) => {
    if (selection.ref.value || all.length === 0) return
    const first = initialRoute(all, lastRoute())
    if (first) void selection.select(first.ref, { replace: true })
  },
  { immediate: true },
)

watch(selection.ref, (current) => {
  if (!settle) cursor.value = null
  if (current) rememberRoute(current)
})

// The selected route is never hidden: its folder opens and the list
// scrolls to it, on arrival as on a link followed.
watch(
  [() => selected.value?.ref, () => routes.value.length],
  async ([current]) => {
    if (!current) return
    const folder = folderOf.value.get(current)
    if (!flatMode.value && folder && collapsed.value.has(folder))
      toggleFolder(folder)
    await nextTick()
    revealActive(true)
  },
  { flush: 'post' },
)
onMounted(() => {
  if (selection.ref.value) rememberRoute(selection.ref.value)
  // Once the list is laid out.
  void nextTick(() => revealActive(true))
})

const count = (value: number) =>
  formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 })
</script>

<template>
  <DmsCard
    :padded="false"
    class="@5xl:max-h-[calc(100dvh-2rem)] @5xl:min-h-[24rem] flex flex-col overflow-hidden"
  >
    <!-- Stacked above the detail, the list folds to the route it shows. -->
    <button
      ref="foldToggle"
      type="button"
      class="hover:bg-elevated @5xl:hidden flex items-center gap-2 px-3 py-2.5 text-left text-[13px]"
      :aria-expanded="listOpen"
      aria-controls="api-route-list"
      @click="listOpen = !listOpen"
    >
      <UIcon name="i-ph-tree-structure" class="text-muted size-4 shrink-0" />
      <template v-if="selected">
        <ApiMethodBadge :method="selected.method" size="sm" />
        <ApiPath :path="selected.path" class="grow" />
      </template>
      <span v-else class="text-default grow">
        {{ t('api.routes.tree.label') }}
      </span>
      <span class="text-dimmed font-mono text-[11px] tabular-nums">
        {{ formatCount(routes.length, locale) }}
      </span>
      <UIcon
        :name="listOpen ? 'i-ph-caret-up' : 'i-ph-caret-down'"
        class="text-muted size-3.5 shrink-0"
      />
    </button>

    <div
      id="api-route-list"
      class="border-default @max-5xl:border-t flex min-h-0 flex-1 flex-col"
      :class="!listOpen && '@max-5xl:hidden'"
    >
      <div class="border-default flex flex-col gap-2.5 border-b p-3">
        <UInput
          ref="searchInput"
          v-model="search"
          icon="i-ph-magnifying-glass"
          size="sm"
          :placeholder="t('api.routes.tree.search')"
          :aria-label="t('api.routes.tree.search')"
          @keydown="onSearchKey"
        >
          <template #trailing>
            <UKbd value="/" />
          </template>
        </UInput>
        <DmsSegmented
          v-model="method"
          :items="methodItems"
          size="sm"
          variant="mono"
          block
          :aria-label="t('api.routes.tree.method')"
        />
        <label
          class="text-muted flex cursor-pointer items-center gap-2 text-[13px]"
        >
          <USwitch v-model="onlyAttention" size="sm" />
          <span class="grow">{{ t('api.routes.tree.only_attention') }}</span>
          <DmsStatusPill
            v-if="attentionCount"
            tone="warning"
            :label="String(attentionCount)"
            dot="none"
            size="sm"
          />
        </label>
        <label
          class="text-muted flex cursor-pointer items-center gap-2 text-[13px]"
        >
          <USwitch v-model="hideIdle" size="sm" />
          <span class="grow">{{ t('api.routes.tree.hide_idle') }}</span>
          <span
            v-if="idleCount"
            class="text-dimmed font-mono text-[11px] tabular-nums"
          >
            {{ formatCount(idleCount, locale) }}
          </span>
        </label>
      </div>

      <div
        ref="scroller"
        class="@max-5xl:max-h-[50vh] relative min-h-0 flex-1 overflow-y-auto py-1.5"
      >
        <p
          v-if="healthWindow && routes.length"
          class="text-dimmed px-3 pb-1.5 pt-0.5 font-mono text-[11px]"
        >
          {{ t('api.routes.tree.window', { window: healthWindow }) }}
        </p>
        <div v-if="pending && !data" class="flex flex-col gap-2 px-3 py-2">
          <USkeleton v-for="index in 8" :key="index" class="h-6 w-full" />
        </div>
        <DmsEmptyState
          v-else-if="error && !data"
          size="sm"
          variant="error"
          :title="t('api.routes.tree.error')"
          :actions="[
            { label: t('api.common.retry'), onClick: () => refresh() },
          ]"
        />
        <DmsEmptyState
          v-else-if="routes.length === 0"
          size="sm"
          :title="t('api.routes.tree.empty_title')"
          :description="t('api.routes.tree.empty_description')"
        />
        <DmsEmptyState
          v-else-if="visible.length === 0"
          size="sm"
          variant="no-result"
          :title="
            search.trim()
              ? t('api.routes.tree.no_match', { search: search.trim() })
              : t('api.routes.tree.no_match_filters')
          "
          :actions="[
            {
              label: t('api.routes.tree.clear'),
              color: 'neutral',
              variant: 'outline',
              onClick: clearFilters,
            },
          ]"
        >
          <p v-if="suggestion" class="text-muted text-sm">
            {{ t('api.routes.tree.did_you_mean') }}
            <button
              type="button"
              class="text-primary font-mono hover:underline"
              @click="search = suggestion"
            >
              {{ suggestion }}
            </button>
          </p>
        </DmsEmptyState>

        <!-- One focus stop: ↑ / ↓ move the active route
             (aria-activedescendant), a click opens it. -->
        <div
          v-else
          ref="tree"
          role="tree"
          tabindex="0"
          class="focus:outline-none"
          :aria-label="t('api.routes.tree.label')"
          :aria-activedescendant="activeId"
          @keydown="onListKey"
        >
          <div
            v-for="section in sections"
            :key="section.path ?? ''"
            :role="section.path ? 'treeitem' : 'none'"
            :aria-level="section.path ? 1 : undefined"
            :aria-expanded="
              section.path ? !collapsed.has(section.path) : undefined
            "
            :aria-label="section.path ?? undefined"
            class="mb-1"
          >
            <div
              v-if="section.path"
              class="text-muted hover:text-default flex w-full cursor-pointer select-none items-center gap-1.5 px-3 py-1.5 font-mono text-[12px]"
              @click="toggleFolder(section.path)"
            >
              <UIcon
                :name="
                  collapsed.has(section.path)
                    ? 'i-ph-caret-right'
                    : 'i-ph-caret-down'
                "
                class="size-3 shrink-0"
              />
              <span class="truncate">{{ section.path }}</span>
              <UIcon
                v-if="STATE_ICON[section.worst]"
                :name="STATE_ICON[section.worst]!.name"
                :class="STATE_ICON[section.worst]!.class"
                class="size-3 shrink-0"
                role="img"
                :aria-label="stateLabel(section.worst)"
              />
              <span class="grow" />
              <span
                class="text-dimmed tabular-nums"
                :title="
                  t('api.routes.tree.folder_routes', section.routes.length)
                "
              >
                {{ section.routes.length }}
              </span>
            </div>
            <div
              v-if="!section.path || !collapsed.has(section.path)"
              :role="section.path ? 'group' : 'none'"
            >
              <div
                v-for="route in section.routes"
                :id="optionId(indexOf.get(route.ref) ?? 0)"
                :key="route.ref"
                role="treeitem"
                :aria-level="section.path ? 2 : 1"
                :aria-selected="route.ref === active"
                :data-route="route.ref"
                class="group mx-1.5 flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-[12.5px] transition-colors"
                :class="
                  route.ref === active
                    ? 'border-primary/60 bg-primary/10 text-highlighted'
                    : 'hover:bg-elevated text-default border-transparent'
                "
                @click="choose(route)"
              >
                <ApiMethodBadge :method="route.method" size="sm" />
                <ApiPath
                  :path="route.path"
                  :prefix="section.path ?? ''"
                  class="grow"
                />
                <span
                  class="text-dimmed font-mono text-[11px] tabular-nums"
                  :title="requestsLabel(route)"
                >
                  {{ count(route.requests) }}
                </span>
                <UIcon
                  v-if="STATE_ICON[route.state]"
                  :name="STATE_ICON[route.state]!.name"
                  :class="STATE_ICON[route.state]!.class"
                  class="size-3.5 shrink-0"
                  role="img"
                  :aria-label="stateLabel(route.state)"
                />
                <span
                  v-else
                  class="mx-1 size-1.5 shrink-0 rounded-full"
                  :class="STATE_DOT[route.state]"
                  role="img"
                  :aria-label="stateLabel(route.state)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        class="border-default text-dimmed flex items-center gap-2 border-t px-3 py-2 font-mono text-[11px]"
      >
        <!-- The count wraps rather than being cut: the toggle beside it is an
             icon, its name in a tooltip, so the line usually holds it all. -->
        <span class="min-w-0">
          {{
            t(
              flatMode
                ? 'api.routes.tree.footer_flat'
                : 'api.routes.tree.footer',
              {
                shown: formatCount(visible.length, locale),
                total: formatCount(routes.length, locale),
                folders: folders.length,
              },
            )
          }}
        </span>
        <span class="grow" />
        <UTooltip
          v-if="!flatMode && folders.length > 1"
          :text="
            allCollapsed
              ? t('api.routes.tree.expand_all')
              : t('api.routes.tree.collapse_all')
          "
        >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            square
            class="shrink-0"
            :icon="allCollapsed ? 'i-ph-caret-up-down' : 'i-ph-caret-line-up'"
            :aria-label="
              allCollapsed
                ? t('api.routes.tree.expand_all')
                : t('api.routes.tree.collapse_all')
            "
            @click="toggleAll"
          />
        </UTooltip>
        <UKbd value="↑" size="sm" class="@max-5xl:hidden shrink-0" />
        <UKbd value="↓" size="sm" class="@max-5xl:hidden shrink-0" />
      </div>
    </div>
  </DmsCard>
</template>
