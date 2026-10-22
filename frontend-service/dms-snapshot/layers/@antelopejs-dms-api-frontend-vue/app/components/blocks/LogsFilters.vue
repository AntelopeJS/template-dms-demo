<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatRelativeDay, formatThreshold } from '../../utils/format'
import {
  isRouteRef,
  LINK_FILTER_KEYS,
  LOG_METHODS,
  readLogsFilters,
  routeMethod,
  windowPreset,
  withLogsFilters,
  type LogsFiltersPatch,
} from '../../utils/logsQuery'

// The filters bar right above the request table: the method, the slow
// requests, and the filters a link brought (route, path, error, an
// incident's range), each removable. Every request kept is the toolbar
// period's "All time"; an incident's range narrows that period, which stays
// the one the user chose.
// Everything here reads and writes the URL (`utils/logsQuery.ts`), as the
// toolbar's period selector does: the table follows the URL, so what the bar
// shows is what the table lists, and the tab counts with it.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  /** The slowness threshold of Settings, in ms: what "slow" means. */
  slowThresholdMs?: number
}>()

const { t } = useI18n()
const { formatLocale: locale } = useRegionalFormat({ locale: 'format' })
const dateFormat = useDateFormat()
const route = useDmsRoute()
const router = useDmsRouter()

const filters = computed(() => readLogsFilters(route.query))
const period = useApiPeriod()

function apply(patch: LogsFiltersPatch) {
  void router.push({ query: withLogsFilters(route.query, patch) })
}

// A route filter fixes the method: the control shows it, and is off.
const methodLocked = computed(
  () => !!filters.value.route && isRouteRef(filters.value.route),
)
const method = computed(() =>
  methodLocked.value ? routeMethod(filters.value.route) : filters.value.method,
)

// One method at a time: plain items, the chosen one checked, and the menu
// closes on a choice (checkbox items would keep it open, as for several).
function methodItem(label: string, value: string | null) {
  const chosen = (filters.value.method ?? null) === value
  return {
    label,
    chosen,
    onSelect: () => apply({ method: value }),
  }
}
const methodItems = computed(() => [
  [methodItem(t('api.logs.filters.all_methods'), null)],
  LOG_METHODS.map((value) => methodItem(value, value)),
])

const slowLabel = computed(() =>
  props.slowThresholdMs === undefined
    ? t('api.logs.filters.slow')
    : t('api.logs.filters.slow_threshold', {
        threshold: formatThreshold(props.slowThresholdMs, locale.value),
      }),
)

interface Chip {
  key: string
  label: string
  /** A filter the table cannot apply: said, not passed off as one. */
  invalid?: boolean
  remove: LogsFiltersPatch
}

// A route as the module names it, without the trailing slash an older link
// carries; one that names no route at all says so.
function linkChip(key: (typeof LINK_FILTER_KEYS)[number], value: string): Chip {
  if (key === 'route' && !isRouteRef(value))
    return {
      key,
      label: t('api.logs.linked.route_unknown', { value }),
      invalid: true,
      remove: { route: null },
    }
  return {
    key,
    label: t(`api.logs.linked.${key}`, {
      value: value,
    }),
    remove: { [key]: null } as LogsFiltersPatch,
  }
}

const chips = computed<Chip[]>(() => {
  const current = filters.value
  const list = LINK_FILTER_KEYS.filter((key) => !!current[key]).map((key) =>
    linkChip(key, current[key]!),
  )
  const incident = current.incident
  if (incident)
    list.push({
      key: 'incident',
      label: t('api.logs.linked.incident', {
        since: formatRelativeDay(incident.from, dateFormat.value),
        until: formatRelativeDay(incident.to, dateFormat.value),
      }),
      remove: { incident: null },
    })
  return list
})

// "Last 24 hours · from Overview": where the link came from, and the period
// the page shows.
const origin = computed(() => {
  const { from } = filters.value
  if (!from) return undefined
  const page = t(`api.logs.linked.pages.${from}`)
  const preset = windowPreset(period.value)
  return preset
    ? t('api.logs.linked.origin_window', {
        window: t(`api.logs.windows.${preset}`),
        page,
      })
    : t('api.logs.linked.origin', { page })
})

const shortcutsOpen = ref(false)

// The table's search is the DMS table's own shortcut, set to "/" by the
// page (`searchShortcut`); J / K, Esc and L are the DMS side panel's and
// live toggle's.
const SHORTCUTS = [
  { keys: ['/'], label: 'api.logs.shortcuts.search' },
  { keys: ['J', 'K'], label: 'api.logs.shortcuts.steps' },
  { keys: ['Esc'], label: 'api.logs.shortcuts.close' },
  { keys: ['L'], label: 'api.logs.shortcuts.live' },
  { keys: ['?'], label: 'api.logs.shortcuts.help' },
]

// Listed on the DMS Shortcuts page (`app/config/shortcuts-registry.ts`).
defineShortcuts({
  '?': () => {
    shortcutsOpen.value = true
  },
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 text-[12.5px]">
    <UTooltip
      :text="
        methodLocked
          ? t('api.logs.filters.method_locked', {
              route: filters.route ?? '',
            })
          : undefined
      "
      :disabled="!methodLocked"
    >
      <span>
        <UDropdownMenu :items="methodItems" :disabled="methodLocked">
          <template #item-trailing="{ item }">
            <UIcon
              v-if="item.chosen"
              name="i-ph-check"
              class="text-primary size-4 shrink-0"
            />
          </template>
          <UButton
            size="sm"
            icon="i-ph-funnel"
            trailing-icon="i-ph-caret-down"
            :color="method ? 'primary' : 'neutral'"
            :variant="method ? 'soft' : 'outline'"
            :disabled="methodLocked"
            :label="
              method
                ? t('api.logs.filters.method_value', { method })
                : t('api.logs.filters.method')
            "
            :aria-label="
              t('api.logs.filters.method_aria', {
                value: method ?? t('api.logs.filters.all_methods'),
              })
            "
          />
        </UDropdownMenu>
      </span>
    </UTooltip>

    <UTooltip :text="t('api.logs.filters.slow_hint')">
      <UButton
        size="sm"
        icon="i-ph-timer"
        :color="filters.slow ? 'primary' : 'neutral'"
        :variant="filters.slow ? 'soft' : 'outline'"
        :label="slowLabel"
        :aria-pressed="filters.slow"
        @click="apply({ slow: !filters.slow })"
      />
    </UTooltip>

    <template v-if="origin || chips.length">
      <span class="bg-(--ui-border) mx-1 h-4 w-px" aria-hidden="true" />
      <span class="text-muted">
        {{ origin ?? t('api.logs.linked.title') }}
      </span>
      <UBadge
        v-for="chip in chips"
        :key="chip.key"
        :color="chip.invalid ? 'warning' : 'primary'"
        variant="soft"
        class="max-w-[28rem] gap-1.5 font-mono"
      >
        <UIcon
          v-if="chip.invalid"
          name="i-ph-warning"
          class="size-3 shrink-0"
        />
        <span
          class="truncate"
          :title="
            chip.invalid ? t('api.logs.linked.route_unknown_hint') : chip.label
          "
        >
          {{ chip.label }}
        </span>
        <button
          type="button"
          class="hover:text-highlighted"
          :aria-label="t('api.logs.linked.remove', { label: chip.label })"
          @click="apply(chip.remove)"
        >
          <UIcon name="i-ph-x" class="size-3" />
        </button>
      </UBadge>
      <UButton
        v-if="chips.length"
        size="xs"
        color="neutral"
        variant="link"
        :label="t('api.logs.linked.clear')"
        @click="apply({ route: null, path: null, error: null, incident: null })"
      />
    </template>

    <span class="grow" />
    <UTooltip :text="t('api.logs.shortcuts.open')">
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-ph-keyboard"
        :aria-label="t('api.logs.shortcuts.title')"
        @click="shortcutsOpen = true"
      />
    </UTooltip>

    <UModal v-model:open="shortcutsOpen" :title="t('api.logs.shortcuts.title')">
      <template #body>
        <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5">
          <template v-for="shortcut in SHORTCUTS" :key="shortcut.label">
            <dt class="flex gap-1">
              <UKbd v-for="key in shortcut.keys" :key="key" :value="key" />
            </dt>
            <dd class="text-toned text-sm">{{ t(shortcut.label) }}</dd>
          </template>
        </dl>
      </template>
    </UModal>
  </div>
</template>
