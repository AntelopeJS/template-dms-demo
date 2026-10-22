<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDmsRouter, useI18n } from '#dms/frontend-module'
import {
  useMarketingApi,
  type MarketingWebsiteCard,
} from '../composables/useMarketingApi'
import { installLink, overviewLink } from '../composables/useMarketingRoutes'
import {
  useWebsiteCards,
  useWebsiteDeletionImpactRead,
} from '../composables/useMarketingReads'
import { useMarketingNow } from '../composables/useMarketingNow'
import {
  formatNumber,
  formatRelativeTime,
  formatShortDate,
  initials,
} from '../utils/format'
import { allowHostConfirmation, hostConflictOf } from '../utils/host-conflict'
import {
  MAX_WEBSITE_DOMAIN_LENGTH,
  MAX_WEBSITE_NAME_LENGTH,
  fractionDigits,
} from '../constants'

/**
 * The Websites page: one card per site with its state, volumes, accepted
 * hosts and capture options; a site still waiting for its first pageview
 * leads to the install guide. Hosts the guard refused show on any card, with
 * the fix. The pencil opens a drawer with the site's General, Capture and
 * Danger zone tabs.
 */
const props = withDefaults(
  defineProps<{ fetchUrl?: string; componentId?: string; pageId?: string }>(),
  { fetchUrl: undefined, componentId: undefined, pageId: undefined },
)

type DrawerTab = 'general' | 'capture' | 'danger'

const CLOCK_TICK_MS = 15_000

const { t, locale } = useI18n()
const router = useDmsRouter()
const api = useMarketingApi()
const toast = useToast()
// A field-tied error from the save shows under its field, the rest as a toast.
const fieldErrors = useFieldErrors({
  fields: {
    name: 'website-name',
    domain: 'website-domain',
    extraDomains: 'website-hosts',
  },
})
const { confirm } = useConfirm()

void props

const cardsRead = useWebsiteCards()
const cards = cardsRead.data
/** The cards could not be read; shown once a retry is over. */
const failed = computed(
  () => !!cardsRead.error.value && cardsRead.status.value !== 'pending',
)

/** The cards again: a retry after a failed read. */
const load = (): Promise<void> => cardsRead.refresh()

/** The website a deletion is asked about. */
const deletionTarget = ref('')
const readDeletionImpact = useWebsiteDeletionImpactRead(deletionTarget)

const now = useMarketingNow(CLOCK_TICK_MS)
/** The browser's zone, which a server render writes the dates in. */
const readerZone = readerTimeZone()

function stateLine(card: MarketingWebsiteCard): string {
  if (
    (card.state === 'live' || card.state === 'imported') &&
    card.lastActivityAt
  ) {
    return t(`page.marketing.context.${card.state}`, {
      ago: formatRelativeTime(card.lastActivityAt, now.value, locale.value),
    })
  }
  return t(`page.marketing.context.state.${card.state}`)
}

const STATE_DOTS = {
  live: 'bg-success',
  imported: 'bg-info',
  waiting: 'bg-warning',
  paused: 'bg-(--ui-text-dimmed)',
} as const

async function openOverview(card: MarketingWebsiteCard): Promise<void> {
  await api.selectContextWebsite(card.id)
  await router.push(overviewLink(card.id))
}

// --- Card actions ----------------------------------------------------------------

/** The card action running, as `<site id>:<what>`, for its spinner. */
const busy = ref<string | null>(null)

async function runCardAction(
  key: string,
  action: () => Promise<unknown>,
  successTitle: string,
  errorTitle: string,
): Promise<void> {
  busy.value = key
  try {
    await action()
    toast.add({ color: 'success', title: successTitle })
    // Their state and counts are the backend's: the page reads them again,
    // the card's spinner on until it shows them.
    await refreshPageBlocks()
  } catch (error) {
    const conflict = hostConflictOf(error)
    if (conflict) {
      toast.add({
        color: 'error',
        title: t(errorTitle),
        description: t('page.marketing.errors.duplicate_host_named', {
          ...conflict,
        }),
      })
    } else {
      fieldErrors.toastError(error, { toastTitle: errorTitle })
    }
  } finally {
    busy.value = null
  }
}

async function allowHost(card: MarketingWebsiteCard, hostname: string) {
  if (!(await confirm(allowHostConfirmation(t, hostname)))) {
    return
  }
  await runCardAction(
    `${card.id}:${hostname}`,
    () => api.allowHost(card.id, hostname),
    t('page.marketing.install.allowed', { host: hostname }),
    'page.marketing.install.allow_error',
  )
}

function resume(card: MarketingWebsiteCard) {
  return runCardAction(
    `${card.id}:resume`,
    () => api.updateWebsite(card.id, { trackingEnabled: true }),
    t('page.marketing.websites.resumed'),
    'page.marketing.websites.save_error',
  )
}

// --- Drawer --------------------------------------------------------------------

const editing = ref<MarketingWebsiteCard | null>(null)
const drawerOpen = ref(false)
const tab = ref<DrawerTab>('general')
const draftName = ref('')
const draftDomain = ref('')
const draftHosts = ref<string[]>([])
const draftTracking = ref(true)
const draftSnapshots = ref(false)
const draftMask = ref(false)
const saving = ref(false)

function edit(
  card: MarketingWebsiteCard,
  initialTab: DrawerTab = 'general',
): void {
  fieldErrors.clear()
  editing.value = card
  tab.value = initialTab
  draftName.value = card.name
  draftDomain.value = card.domain
  draftHosts.value = [...card.extraDomains]
  draftTracking.value = card.state !== 'paused'
  draftSnapshots.value = card.snapshotsEnabled
  draftMask.value = card.snapshotMaskText
  drawerOpen.value = true
}

// The content stays while the drawer slides out; it goes once it is gone.
function onDrawerClosed(): void {
  editing.value = null
}

const tabItems = computed(() => [
  { value: 'general', label: t('page.marketing.websites.drawer.general') },
  { value: 'capture', label: t('page.marketing.websites.drawer.capture') },
  { value: 'danger', label: t('page.marketing.websites.drawer.danger') },
])

/** Turning snapshots off, or changing the mask, discards the captures. */
const discardsSnapshots = computed(
  () =>
    editing.value !== null &&
    editing.value.snapshots > 0 &&
    (draftSnapshots.value !== editing.value.snapshotsEnabled ||
      draftMask.value !== editing.value.snapshotMaskText),
)

/** Empty required fields say so under themselves, on the General tab. */
async function requireFields(): Promise<boolean> {
  const blank = (['domain', 'name'] as const).filter(
    (field) => !{ name: draftName, domain: draftDomain }[field].value.trim(),
  )
  if (blank.length > 0) {
    tab.value = 'general'
  }
  for (const field of blank) {
    await fieldErrors.setError(field, t('dms.field_errors.required'))
  }
  return blank.length === 0
}

async function save(): Promise<void> {
  const card = editing.value
  if (!card || !(await requireFields())) {
    return
  }
  saving.value = true
  try {
    await api.updateWebsite(card.id, {
      name: draftName.value.trim(),
      domain: draftDomain.value.trim(),
      extraDomains: draftHosts.value.map((host) => host.trim()).filter(Boolean),
      trackingEnabled: draftTracking.value,
      snapshotsEnabled: draftSnapshots.value,
      snapshotMaskText: draftMask.value,
    })
    toast.add({ color: 'success', title: t('page.marketing.websites.saved') })
    drawerOpen.value = false
    refreshPageBlocks()
  } catch (error) {
    // A refused field lives on the General tab: show it there.
    const conflict = hostConflictOf(error)
    if (conflict) {
      tab.value = 'general'
      await fieldErrors.setError(
        conflict.field === 'extraDomains' ? 'extraDomains' : 'domain',
        t('page.marketing.errors.duplicate_host_named', { ...conflict }),
      )
      return
    }
    if (await fieldErrors.applyApiError(error)) {
      tab.value = 'general'
      return
    }
    fieldErrors.toastError(error, {
      toastTitle: 'page.marketing.websites.save_error',
    })
  } finally {
    saving.value = false
  }
}

async function remove(card: MarketingWebsiteCard): Promise<void> {
  let impact
  try {
    deletionTarget.value = card.id
    impact = await readDeletionImpact()
  } catch (error) {
    fieldErrors.toastError(error, {
      toastTitle: 'page.marketing.websites.delete.impact_error',
    })
    return
  }
  // Every stored day goes, so the counts read "since the oldest one".
  const since =
    impact.since === null ? null : formatShortDate(impact.since, locale.value)
  const sinceLabel = (key: 'sessions' | 'pageviews') =>
    since === null
      ? t(`page.marketing.websites.delete.${key}`)
      : t(`page.marketing.websites.delete.${key}_since`, { date: since })
  await confirm({
    title: t('page.marketing.websites.delete.title', { name: card.name }),
    description: t('page.marketing.websites.delete.description'),
    color: 'error',
    icon: 'i-ph-trash',
    confirmLabel: t('page.marketing.websites.delete.confirm'),
    // A hostname is not case-sensitive: neither is the typed check.
    confirmText: card.domain,
    confirmTextCaseInsensitive: true,
    impact: [
      {
        icon: 'i-ph-users',
        label: sinceLabel('sessions'),
        count: formatNumber(impact.sessions, locale.value),
      },
      {
        icon: 'i-ph-eye',
        label: sinceLabel('pageviews'),
        count: formatNumber(impact.pageviews, locale.value),
      },
      {
        icon: 'i-ph-funnel',
        label: t('page.marketing.websites.delete.funnels'),
        count: impact.funnels,
      },
      {
        icon: 'i-ph-camera',
        label: t('page.marketing.websites.delete.snapshots'),
        count: impact.snapshots,
      },
    ],
    onConfirm: async () => {
      await api.deleteWebsite(card.id)
      toast.add({
        color: 'success',
        title: t('page.marketing.websites.delete.done', { name: card.name }),
      })
      drawerOpen.value = false
      // Its card goes; the others are unchanged, so nothing is read again.
      cards.value = cards.value?.filter((other) => other.id !== card.id) ?? null
    },
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <DmsEmptyState
      v-if="failed"
      variant="error"
      class="dms-card"
      :title="t('page.marketing.websites.error')"
    >
      <template #actions>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-arrow-clockwise"
          :label="t('page.marketing.common.retry')"
          @click="load"
        />
      </template>
    </DmsEmptyState>

    <div v-else-if="!cards" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <USkeleton v-for="index in 3" :key="index" class="h-72 rounded-xl" />
    </div>

    <DmsMarketingFirstRun v-else-if="cards.length === 0" />

    <template v-else>
      <!-- The page's "collection paused" Banner block, when the module is paused. -->
      <slot />

      <div class="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="card in cards"
          :key="card.id"
          class="flex flex-col overflow-hidden rounded-xl border bg-(--ui-bg)"
          :class="
            card.state === 'waiting'
              ? 'border-dashed border-warning/60'
              : 'dms-card p-0'
          "
        >
          <header class="flex items-start gap-3 px-4 pt-4">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 font-mono text-sm font-semibold text-(--ui-color-primary-800) dark:text-primary"
            >
              {{ initials(card.name) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold text-highlighted">
                {{ card.name }}
              </span>
              <span class="block truncate font-mono text-xs text-dimmed">
                {{ card.domain }}
              </span>
            </span>
            <UButton
              icon="i-ph-pencil-simple"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="
                t('page.marketing.websites.edit_named', { name: card.name })
              "
              @click="edit(card)"
            />
          </header>
          <p
            class="flex items-center gap-2 px-4 pt-3 pb-3 font-mono text-xs text-muted"
          >
            <span class="size-2 rounded-full" :class="STATE_DOTS[card.state]" />
            {{ stateLine(card) }}
          </p>

          <div
            v-if="card.state === 'paused' || card.rejected.length > 0"
            class="flex flex-col gap-2 px-4 pb-3"
          >
            <DmsBanner
              v-if="card.state === 'paused'"
              tone="info"
              size="sm"
              icon="i-ph-pause-circle"
              :title="t('page.marketing.websites.paused_description')"
            >
              <template #actions>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-ph-play"
                  :loading="busy === `${card.id}:resume`"
                  :label="t('page.marketing.websites.resume')"
                  @click="resume(card)"
                />
              </template>
            </DmsBanner>
            <DmsBanner
              v-for="refused in card.rejected"
              :key="refused.hostname"
              tone="warning"
              size="sm"
              icon="i-ph-prohibit"
              :title="
                t(
                  'page.marketing.websites.refused',
                  { count: refused.count, host: refused.hostname },
                  refused.count,
                )
              "
            >
              <template #actions>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :loading="busy === `${card.id}:${refused.hostname}`"
                  :label="t('page.marketing.install.allow')"
                  @click="allowHost(card, refused.hostname)"
                />
              </template>
            </DmsBanner>
          </div>

          <template v-if="card.state !== 'waiting'">
            <div class="border-y border-default">
              <!-- The window the three counts cover, whatever period the
                   other pages show. -->
              <p
                class="px-4 pt-1.5 text-right font-mono text-[10px] text-dimmed"
              >
                {{ t('page.marketing.websites.stats.window') }}
              </p>
              <dl class="grid grid-cols-3">
                <div
                  v-for="stat in ['sessions', 'pages', 'funnels'] as const"
                  :key="stat"
                  class="border-default px-4 pt-0.5 pb-3 not-first:border-l"
                >
                  <dt>
                    <DmsEyebrow
                      :label="t(`page.marketing.websites.stats.${stat}`)"
                    />
                  </dt>
                  <dd
                    class="mt-1 font-mono text-lg font-semibold tabular-nums text-highlighted"
                  >
                    {{ formatNumber(card[stat], locale) }}
                  </dd>
                </div>
              </dl>
            </div>
            <dl class="flex flex-col gap-2 px-4 py-3 text-sm">
              <div class="flex items-start justify-between gap-3">
                <dt
                  class="flex shrink-0 items-center gap-2 whitespace-nowrap text-muted"
                >
                  <UIcon name="i-ph-link" class="size-3.5" />
                  {{ t('page.marketing.websites.also_accepts') }}
                </dt>
                <dd class="flex min-w-0 flex-wrap justify-end gap-1">
                  <span
                    v-for="host in card.extraDomains"
                    :key="host"
                    class="max-w-full truncate rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-toned"
                  >
                    {{ host }}
                  </span>
                  <span
                    v-if="card.extraDomains.length === 0"
                    class="text-xs text-dimmed"
                  >
                    {{ t('page.marketing.websites.subdomains_only') }}
                  </span>
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt
                  class="flex shrink-0 items-center gap-2 whitespace-nowrap text-muted"
                >
                  <UIcon name="i-ph-camera" class="size-3.5" />
                  {{ t('page.marketing.websites.snapshots') }}
                </dt>
                <dd>
                  <DmsStatusPill
                    size="sm"
                    :mono="false"
                    :tone="card.snapshotsEnabled ? 'success' : 'neutral'"
                    :label="
                      card.snapshotsEnabled
                        ? t(
                            card.snapshotMaskText
                              ? 'page.marketing.websites.snapshots_masked'
                              : 'page.marketing.websites.snapshots_on',
                          )
                        : t('page.marketing.websites.snapshots_off')
                    "
                  />
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt
                  class="flex shrink-0 items-center gap-2 whitespace-nowrap text-muted"
                >
                  <UIcon name="i-ph-cursor-click" class="size-3.5" />
                  {{ t('page.marketing.websites.sampling') }}
                </dt>
                <dd class="text-right font-mono text-xs text-highlighted">
                  {{
                    formatPercentage(card.sampleRate, locale, fractionDigits(0))
                  }}
                  ·
                  {{ t('page.marketing.websites.sampling_default') }}
                </dd>
              </div>
            </dl>
            <footer
              class="mt-auto flex items-center justify-between gap-2 border-t border-default px-4 py-3"
            >
              <UButton
                icon="i-ph-code"
                size="sm"
                color="neutral"
                variant="outline"
                :label="t('page.marketing.websites.snippet_button')"
                :aria-label="
                  t('page.marketing.websites.snippet_named', {
                    name: card.name,
                  })
                "
                :to="installLink(card.id)"
              />
              <UButton
                trailing-icon="i-ph-arrow-right"
                size="sm"
                color="neutral"
                variant="ghost"
                :label="t('page.marketing.websites.open_overview')"
                :aria-label="
                  t('page.marketing.websites.open_overview_named', {
                    name: card.name,
                  })
                "
                @click="openOverview(card)"
              />
            </footer>
          </template>

          <template v-else>
            <p class="px-4 text-sm text-muted">
              {{
                t(
                  card.rejected.length > 0
                    ? 'page.marketing.websites.waiting_refused'
                    : 'page.marketing.websites.waiting_description',
                  {
                    date: formatShortDate(card.createdAt, locale, readerZone),
                  },
                )
              }}
            </p>
            <footer class="mt-auto px-4 py-4">
              <UButton
                icon="i-ph-pulse"
                size="sm"
                :label="t('page.marketing.websites.finish_install')"
                :aria-label="
                  t('page.marketing.websites.finish_install_named', {
                    name: card.name,
                  })
                "
                :to="installLink(card.id)"
              />
            </footer>
          </template>
        </article>
      </div>
    </template>

    <p
      v-if="cards && cards.length > 0"
      class="flex items-center gap-2 text-xs text-dimmed"
    >
      <UIcon name="i-ph-shield-check" class="size-4" />
      {{ t('page.marketing.websites.privacy') }}
    </p>

    <USlideover
      v-model:open="drawerOpen"
      :ui="{ content: 'max-w-lg', title: 'min-w-0' }"
      @after:leave="onDrawerClosed"
    >
      <template #title>
        <span v-if="editing" class="flex min-w-0 flex-col gap-2">
          <DmsEyebrow :label="t('page.marketing.websites.drawer.eyebrow')" />
          <span class="flex min-w-0 items-center gap-3">
            <span
              class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 font-mono text-sm font-semibold text-(--ui-color-primary-800) dark:text-primary"
            >
              {{ initials(editing.name) }}
            </span>
            <span class="truncate text-xl font-semibold text-highlighted">
              {{ editing.name }}
            </span>
          </span>
        </span>
      </template>
      <template #description>
        <span v-if="editing" class="font-mono text-xs break-all text-dimmed">
          {{ editing.id }} ·
          {{
            t('page.marketing.websites.drawer.added', {
              date: formatShortDate(editing.createdAt, locale),
            })
          }}
        </span>
      </template>
      <template #body>
        <div v-if="editing" class="flex flex-col gap-5">
          <DmsSegmented
            v-model="tab"
            :items="tabItems"
            size="sm"
            class="self-start"
          />
          <template v-if="tab === 'general'">
            <DmsFieldRow
              layout="stack"
              spacing="list"
              :inset="false"
              label="$page.marketing.websites.fields.name"
              label-for="website-name"
              required
            >
              <UInput
                id="website-name"
                v-model="draftName"
                class="w-full"
                :maxlength="MAX_WEBSITE_NAME_LENGTH"
                v-bind="fieldErrors.aria('name')"
                @update:model-value="fieldErrors.clear('name')"
              />
              <DmsFieldError
                :id="fieldErrors.errorId('name')"
                :message="fieldErrors.errors.name"
              />
            </DmsFieldRow>
            <DmsFieldRow
              layout="stack"
              spacing="list"
              :inset="false"
              label="$page.marketing.websites.fields.domain"
              description="$page.marketing.websites.fields.domain_hint"
              label-for="website-domain"
              required
            >
              <UInput
                id="website-domain"
                v-model="draftDomain"
                class="w-full font-mono"
                :maxlength="MAX_WEBSITE_DOMAIN_LENGTH"
                v-bind="fieldErrors.aria('domain')"
                @update:model-value="fieldErrors.clear('domain')"
              />
              <DmsFieldError
                :id="fieldErrors.errorId('domain')"
                :message="fieldErrors.errors.domain"
              />
            </DmsFieldRow>
            <DmsFieldRow
              layout="stack"
              spacing="list"
              :inset="false"
              label="$page.marketing.websites.fields.hosts"
              description="$page.marketing.websites.fields.hosts_hint"
              label-for="website-hosts"
            >
              <UInputTags
                id="website-hosts"
                v-model="draftHosts"
                class="w-full font-mono"
                :placeholder="'staging.example.com'"
                v-bind="fieldErrors.aria('extraDomains')"
                @update:model-value="fieldErrors.clear('extraDomains')"
              />
              <DmsFieldError
                :id="fieldErrors.errorId('extraDomains')"
                :message="fieldErrors.errors.extraDomains"
              />
            </DmsFieldRow>
            <DmsFieldRow
              spacing="list"
              :inset="false"
              label="$page.marketing.websites.fields.tracking"
              description="$page.marketing.websites.fields.tracking_hint"
              label-for="website-tracking"
            >
              <USwitch id="website-tracking" v-model="draftTracking" />
            </DmsFieldRow>
            <DmsFormRequiredLegend />
          </template>
          <template v-else-if="tab === 'capture'">
            <DmsFieldRow
              spacing="list"
              :inset="false"
              label="$page.marketing.websites.fields.snapshots"
              description="$page.marketing.websites.fields.snapshots_hint"
              label-for="website-snapshots"
            >
              <USwitch id="website-snapshots" v-model="draftSnapshots" />
            </DmsFieldRow>
            <DmsFieldRow
              spacing="list"
              :inset="false"
              label="$page.marketing.websites.fields.mask"
              description="$page.marketing.websites.fields.mask_hint"
              label-for="website-mask"
              :disabled="!draftSnapshots"
            >
              <USwitch
                id="website-mask"
                v-model="draftMask"
                :disabled="!draftSnapshots"
              />
            </DmsFieldRow>
            <DmsBanner
              v-if="discardsSnapshots"
              tone="warning"
              size="sm"
              :title="
                t(
                  'page.marketing.websites.fields.discard',
                  { count: editing.snapshots },
                  editing.snapshots,
                )
              "
            />
          </template>
          <template v-else>
            <div
              class="flex flex-col gap-3 rounded-lg border border-error/40 p-4"
            >
              <span class="text-sm font-semibold text-highlighted">
                {{ t('page.marketing.websites.delete.section') }}
              </span>
              <span class="text-sm text-muted">
                {{ t('page.marketing.websites.delete.section_description') }}
              </span>
              <UButton
                class="self-start"
                color="error"
                variant="outline"
                icon="i-ph-trash"
                :label="t('page.marketing.websites.delete.action')"
                @click="remove(editing)"
              />
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <div
          v-if="tab !== 'danger'"
          class="flex w-full items-center justify-between"
        >
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('page.marketing.common.cancel')"
            @click="drawerOpen = false"
          />
          <UButton
            :loading="saving"
            :label="t('page.marketing.common.save_changes')"
            @click="save"
          />
        </div>
        <UButton
          v-else
          class="ml-auto"
          color="neutral"
          variant="outline"
          :label="t('page.marketing.websites.drawer.close')"
          @click="drawerOpen = false"
        />
      </template>
    </USlideover>
  </div>
</template>
