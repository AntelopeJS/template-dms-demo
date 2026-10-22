<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  useDmsRoute,
  useDmsRouter,
  useDmsRuntimeConfig,
  useI18n,
} from '#dms/frontend-module'
import { useMarketingApi } from '../composables/useMarketingApi'
import { useWebsiteConnection } from '../composables/useMarketingReads'
import {
  installLink,
  overviewLink,
  websitesLink,
} from '../composables/useMarketingRoutes'
import { allowHostConfirmation, hostConflictOf } from '../utils/host-conflict'
import { trackerSnippet } from '../utils/snippet'

/**
 * The guided install (`?website=` once the site exists): add the website,
 * paste the tag, then a connection check that polls until a pageview arrives
 * — or names a host the guard refused, with the fix. "Check again" waits for
 * a pageview sent after it, to re-verify a site already live.
 */
const props = withDefaults(
  defineProps<{ componentId?: string; pageId?: string }>(),
  {
    componentId: undefined,
    pageId: undefined,
  },
)

const POLL_MS = 4000
const HTTP_NOT_FOUND = 404
const MAX_NAME_LENGTH = 100
const MAX_DOMAIN_LENGTH = 253

void props

const { t, locale } = useI18n()
const route = useDmsRoute()
const router = useDmsRouter()
const config = useDmsRuntimeConfig()
const api = useMarketingApi()
const toast = useToast()
const { confirm } = useConfirm()
// A field-tied error from the creation shows under its field, the rest as a toast.
const fieldErrors = useFieldErrors({
  fields: { name: 'install-name', domain: 'install-domain' },
})

const websiteId = ref(
  typeof route.query.website === 'string' ? route.query.website : '',
)
/** Server time "Check again" waits from; null: since the site's creation. */
const recheckSince = ref<number | null>(null)
/** The check's polling period: `POLL_MS` while it waits for a pageview, 0 (stopped) otherwise. */
const pollInterval = ref(0)
const connection = useWebsiteConnection(websiteId, recheckSince, {
  refreshInterval: pollInterval,
})
const status = connection.data
/** The `?website=` names no site of the workspace (deleted, mistyped). */
const missing = computed(
  () => apiErrorStatus(connection.error.value) === HTTP_NOT_FOUND,
)
/** The last check failed; the next one is on its way. */
const failed = computed(() => !!connection.error.value && !missing.value)

// --- Step 1 ----------------------------------------------------------------------

const name = ref('')
const domain = ref('')
const creating = ref(false)

/** Empty required fields say so under themselves, the first one focused. */
async function requireFields(): Promise<boolean> {
  const blank = (['domain', 'name'] as const).filter(
    (field) => !{ name, domain }[field].value.trim(),
  )
  for (const field of blank) {
    await fieldErrors.setError(field, t('dms.field_errors.required'))
  }
  return blank.length === 0
}

async function createWebsite(): Promise<void> {
  fieldErrors.clear()
  if (!(await requireFields())) {
    return
  }
  creating.value = true
  try {
    const created = await api.createWebsite({
      name: name.value.trim(),
      domain: domain.value.trim(),
    })
    await api.selectContextWebsite(created._id)
    websiteId.value = created._id
    await router.replace(installLink(created._id))
  } catch (error) {
    const conflict = hostConflictOf(error)
    if (conflict) {
      await fieldErrors.setError(
        'domain',
        t('page.marketing.errors.duplicate_host_named', { ...conflict }),
      )
      return
    }
    await fieldErrors.handleApiError(error, {
      toastTitle: 'page.marketing.install.create_error',
    })
  } finally {
    creating.value = false
  }
}

// --- Step 3: connection check ---------------------------------------------------

/** No pageview yet, and the site is there: the check polls. */
const isWaiting = computed(
  () => !!websiteId.value && !missing.value && !status.value?.visit,
)
// The check polls while it waits, and stops once a pageview arrived or the
// site is gone.
watch(
  isWaiting,
  (waiting) => {
    pollInterval.value = waiting ? POLL_MS : 0
  },
  { immediate: true },
)

/** Waits for a pageview sent from now on, to re-verify an installed tag. */
function checkAgain(): void {
  if (!status.value) {
    return
  }
  recheckSince.value = status.value.checkedAt
  status.value = { ...status.value, visit: null }
}

const apiOrigin = ref('')
onMounted(() => {
  // Read once mounted: the server renders with its internal backend URL.
  apiOrigin.value = String(
    (config.public as { dms?: { baseURL?: string } }).dms?.baseURL ?? '',
  )
})

watch(
  () => route.query.website,
  (value) => {
    const next = typeof value === 'string' ? value : ''
    if (next !== websiteId.value) {
      websiteId.value = next
      recheckSince.value = null
      connection.clear()
    }
  },
)

const website = computed(() => status.value?.website ?? null)
/** The site named in the URL is still being loaded. */
const loading = computed(
  () => !!websiteId.value && !website.value && !missing.value,
)
const visit = computed(() => status.value?.visit ?? null)
const allowing = ref<string | null>(null)

async function allow(hostname: string): Promise<void> {
  if (!(await confirm(allowHostConfirmation(t, hostname)))) {
    return
  }
  allowing.value = hostname
  try {
    await api.allowHost(websiteId.value, hostname)
    toast.add({
      color: 'success',
      title: t('page.marketing.install.allowed', { host: hostname }),
    })
    // The refused host leaves the check before its button comes back.
    await refreshPageBlocks()
  } catch (error) {
    const conflict = hostConflictOf(error)
    if (conflict) {
      toast.add({
        color: 'error',
        title: t('page.marketing.install.allow_error'),
        description: t('page.marketing.errors.duplicate_host_named', {
          ...conflict,
        }),
      })
    } else {
      fieldErrors.toastError(error, {
        toastTitle: 'page.marketing.install.allow_error',
      })
    }
  } finally {
    allowing.value = null
  }
}

const resuming = ref(false)

async function resumeTracking(): Promise<void> {
  resuming.value = true
  try {
    await api.updateWebsite(websiteId.value, { trackingEnabled: true })
    toast.add({
      color: 'success',
      title: t('page.marketing.websites.resumed'),
    })
    await refreshPageBlocks()
  } catch (error) {
    fieldErrors.toastError(error, {
      toastTitle: 'page.marketing.websites.save_error',
    })
  } finally {
    resuming.value = false
  }
}

async function openOverview(): Promise<void> {
  await api.selectContextWebsite(websiteId.value)
  await router.push(overviewLink(websiteId.value))
}

/** "11 Oct, 14:02": the DMS date and time, without its year and seconds. */
const EVENT_TIME: Intl.DateTimeFormatOptions = {
  year: undefined,
  month: 'short',
  day: 'numeric',
  second: undefined,
}

function when(at: number): string {
  return formatDateTime(at, locale.value, EVENT_TIME) ?? ''
}

const siteUrl = computed(() =>
  website.value ? `https://${website.value.domain}` : '',
)

const developerNote = computed(() =>
  website.value
    ? t('page.marketing.install.developer_note', {
        name: website.value.name,
        domain: website.value.domain,
        snippet: trackerSnippet('html', apiOrigin.value, website.value.id),
      })
    : '',
)

const COPIED_FOR_MS = 1600
const copied = ref(false)

async function copy(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text)
  copied.value = true
  setTimeout(() => (copied.value = false), COPIED_FOR_MS)
}

const RECORDS = ['pageviews', 'clicks', 'snapshots', 'privacy'] as const
const RECORD_ICONS: Record<(typeof RECORDS)[number], string> = {
  pageviews: 'i-ph-eye',
  clicks: 'i-ph-cursor-click',
  snapshots: 'i-ph-camera',
  privacy: 'i-ph-shield-check',
}

const stepTwoState = computed(() =>
  visit.value ? 'done' : website.value ? 'current' : 'next',
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex flex-wrap items-start gap-4">
      <UButton
        icon="i-ph-arrow-left"
        color="neutral"
        variant="ghost"
        :to="websitesLink()"
        :aria-label="t('page.marketing.install.back')"
      />
      <div class="min-w-0 flex-1 basis-60">
        <h1 class="text-2xl font-semibold break-words text-highlighted">
          {{
            website
              ? t('page.marketing.install.title_for', { name: website.name })
              : t('page.marketing.install.title')
          }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ t('page.marketing.install.subtitle') }}
        </p>
      </div>
      <UButton
        v-if="website"
        :icon="copied ? 'i-ph-check' : 'i-ph-paper-plane-tilt'"
        color="neutral"
        variant="outline"
        :label="t('page.marketing.install.copy_instructions')"
        @click="copy(developerNote)"
      />
    </header>

    <DmsEmptyState
      v-if="missing"
      class="dms-card"
      icon="i-ph-globe-x"
      :title="t('page.marketing.install.missing.title')"
      :description="t('page.marketing.install.missing.description')"
    >
      <template #actions>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-arrow-left"
          :label="t('page.marketing.install.back')"
          :to="websitesLink()"
        />
        <UButton
          size="sm"
          icon="i-ph-plus"
          :label="t('page.marketing.websites.create')"
          :to="installLink()"
        />
      </template>
    </DmsEmptyState>

    <div
      v-else
      class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <ol class="dms-card flex flex-col gap-0 p-5">
        <li class="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 pb-6">
          <span class="flex flex-col items-center">
            <span
              class="grid size-8 place-items-center rounded-full border font-mono text-xs"
              :class="
                website
                  ? 'border-primary/40 text-primary'
                  : 'border-primary bg-primary text-inverted'
              "
            >
              <UIcon v-if="website" name="i-ph-check" class="size-4" />
              <template v-else>1</template>
            </span>
            <span class="mt-2 w-px flex-1 bg-(--ui-border)" />
          </span>
          <div class="flex min-w-0 flex-col gap-2">
            <h2 class="flex items-center gap-2 font-semibold text-highlighted">
              {{ t('page.marketing.install.step1') }}
              <DmsStatusPill
                v-if="website"
                tone="success"
                size="sm"
                :mono="false"
                :label="t('page.marketing.install.done')"
              />
            </h2>
            <USkeleton v-if="loading" class="h-5 w-64" />
            <p v-else-if="website" class="text-sm break-words text-muted">
              <span class="font-semibold text-highlighted">
                {{ website.name }}
              </span>
              ·
              <span class="font-mono">{{ website.domain }}</span>
              {{ t('page.marketing.install.and_subdomains') }}
              <DmsAutoLink
                :to="websitesLink()"
                class="text-primary hover:underline"
              >
                {{ t('page.marketing.common.edit') }}
              </DmsAutoLink>
            </p>
            <form
              v-else
              class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start"
              novalidate
              @submit.prevent="createWebsite"
            >
              <DmsFieldRow
                layout="stack"
                spacing="list"
                :inset="false"
                label="$page.marketing.websites.fields.name"
                label-for="install-name"
                required
              >
                <UInput
                  id="install-name"
                  v-model="name"
                  class="w-full"
                  placeholder="Acme shop"
                  :maxlength="MAX_NAME_LENGTH"
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
                label-for="install-domain"
                required
              >
                <UInput
                  id="install-domain"
                  v-model="domain"
                  class="w-full font-mono"
                  placeholder="shop.example.com"
                  :maxlength="MAX_DOMAIN_LENGTH"
                  v-bind="fieldErrors.aria('domain')"
                  @update:model-value="fieldErrors.clear('domain')"
                />
                <DmsFieldError
                  :id="fieldErrors.errorId('domain')"
                  :message="fieldErrors.errors.domain"
                />
                <!-- Under the control, so both inputs of the row line up. -->
                <p v-if="!fieldErrors.errors.domain" class="text-xs text-muted">
                  {{ t('page.marketing.websites.fields.domain_hint') }}
                </p>
              </DmsFieldRow>
              <UButton
                type="submit"
                icon="i-ph-plus"
                class="md:mt-6"
                :loading="creating"
                :label="t('page.marketing.install.add')"
              />
              <DmsFormRequiredLegend class="md:col-span-3" />
            </form>
          </div>
        </li>

        <li class="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 pb-6">
          <span class="flex flex-col items-center">
            <span
              class="grid size-8 place-items-center rounded-full border font-mono text-xs"
              :class="
                stepTwoState === 'done'
                  ? 'border-primary/40 text-primary'
                  : stepTwoState === 'current'
                    ? 'border-primary bg-primary text-inverted ring-4 ring-primary/20'
                    : 'border-default text-dimmed'
              "
            >
              <UIcon
                v-if="stepTwoState === 'done'"
                name="i-ph-check"
                class="size-4"
              />
              <template v-else>2</template>
            </span>
            <span class="mt-2 w-px flex-1 bg-(--ui-border)" />
          </span>
          <div class="flex min-w-0 flex-col gap-3">
            <h2
              class="font-semibold"
              :class="website ? 'text-highlighted' : 'text-muted'"
            >
              {{ t('page.marketing.install.step2') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('page.marketing.install.step2_description') }}
            </p>
            <DmsMarketingTrackerSnippet
              v-if="website"
              :website-id="website.id"
            />
            <UCollapsible
              v-if="website"
              class="rounded-lg border border-default"
            >
              <UButton
                color="neutral"
                variant="ghost"
                block
                class="justify-start"
                icon="i-ph-sliders-horizontal"
                trailing-icon="i-ph-caret-down"
              >
                <span class="font-medium">
                  {{ t('page.marketing.install.options') }}
                </span>
                <span class="text-xs text-dimmed">
                  {{ t('page.marketing.install.options_hint') }}
                </span>
              </UButton>
              <template #content>
                <dl
                  class="grid grid-cols-[12rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-4 pb-4 text-sm"
                >
                  <dt class="font-mono text-xs text-highlighted">
                    data-heatmap-sample
                  </dt>
                  <dd class="text-muted">
                    {{ t('page.marketing.install.option_sample') }}
                  </dd>
                  <dt class="font-mono text-xs text-highlighted">
                    data-do-not-track
                  </dt>
                  <dd class="text-muted">
                    {{ t('page.marketing.install.option_dnt') }}
                  </dd>
                  <dt class="font-mono text-xs text-highlighted">
                    data-host-url
                  </dt>
                  <dd class="text-muted">
                    {{ t('page.marketing.install.option_host') }}
                  </dd>
                </dl>
              </template>
            </UCollapsible>
          </div>
        </li>

        <li class="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
          <span class="flex flex-col items-center">
            <span
              class="grid size-8 place-items-center rounded-full border font-mono text-xs"
              :class="
                visit
                  ? 'border-success bg-success text-inverted'
                  : 'border-default text-dimmed'
              "
            >
              <UIcon v-if="visit" name="i-ph-check" class="size-4" />
              <template v-else>3</template>
            </span>
          </span>
          <div class="flex min-w-0 flex-col gap-3">
            <h2
              class="font-semibold"
              :class="website ? 'text-highlighted' : 'text-muted'"
            >
              {{ t('page.marketing.install.step3') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('page.marketing.install.step3_description') }}
            </p>
            <template v-if="website && status">
              <!-- The page's "collection paused" Banner block, when the module is paused. -->
              <slot />
              <DmsBanner
                v-if="website.state === 'paused'"
                tone="info"
                icon="i-ph-pause-circle"
                :title="t('page.marketing.context.state.paused')"
                :description="t('page.marketing.websites.paused_description')"
              >
                <template #actions>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-ph-play"
                    :loading="resuming"
                    :label="t('page.marketing.websites.resume')"
                    @click="resumeTracking"
                  />
                </template>
              </DmsBanner>
              <div
                v-if="visit"
                class="flex flex-wrap items-center gap-4 rounded-lg border border-success/40 bg-success/10 p-4"
              >
                <DmsIconWell icon="i-ph-check" tone="success" />
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold text-highlighted">
                    {{
                      t('page.marketing.install.connected', {
                        when: when(visit.at),
                      })
                    }}
                  </span>
                  <span class="block font-mono text-xs break-all text-muted">
                    {{ visit.host ?? '' }}{{ visit.url }} ·
                    {{ visit.browser ?? '—' }} · {{ visit.deviceType }}
                  </span>
                </span>
                <span class="flex flex-wrap items-center gap-2">
                  <UButton
                    icon="i-ph-arrow-clockwise"
                    color="neutral"
                    variant="outline"
                    :label="t('page.marketing.install.check_again')"
                    @click="checkAgain"
                  />
                  <UButton
                    trailing-icon="i-ph-arrow-right"
                    :label="t('page.marketing.install.open_overview')"
                    @click="openOverview"
                  />
                </span>
              </div>
              <div
                v-else
                class="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4"
              >
                <span
                  class="relative grid size-10 place-items-center rounded-full border border-primary/40 text-primary"
                >
                  <UIcon name="i-ph-broadcast" class="size-5" />
                  <span
                    class="absolute inset-0 animate-ping rounded-full border border-primary/30"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block font-semibold break-words text-highlighted"
                  >
                    {{
                      t(
                        recheckSince === null
                          ? 'page.marketing.install.listening'
                          : 'page.marketing.install.listening_again',
                        { domain: website.domain },
                      )
                    }}
                  </span>
                  <span class="block text-xs text-muted">
                    {{
                      recheckSince === null
                        ? t('page.marketing.install.listening_since', {
                            when: when(status.createdAt),
                          })
                        : t('page.marketing.install.listening_again_since', {
                            when: when(recheckSince),
                          })
                    }}
                  </span>
                </span>
                <UButton
                  v-if="siteUrl"
                  icon="i-ph-arrow-square-out"
                  color="neutral"
                  variant="outline"
                  :to="siteUrl"
                  target="_blank"
                  :label="t('page.marketing.install.open_site')"
                />
              </div>
              <div
                v-for="refused in status.rejected"
                :key="refused.hostname"
                class="flex flex-wrap items-center gap-4 rounded-lg border border-error/40 bg-error/10 p-4"
              >
                <DmsIconWell icon="i-ph-prohibit" tone="error" />
                <span class="min-w-0 flex-1">
                  <span
                    class="block font-semibold break-words text-highlighted"
                  >
                    {{
                      t(
                        'page.marketing.install.refused',
                        { count: refused.count, host: refused.hostname },
                        refused.count,
                      )
                    }}
                  </span>
                  <span class="block text-xs text-muted">
                    {{ t('page.marketing.install.refused_hint') }}
                  </span>
                </span>
                <UButton
                  color="neutral"
                  variant="outline"
                  :loading="allowing === refused.hostname"
                  :label="t('page.marketing.install.allow')"
                  @click="allow(refused.hostname)"
                />
              </div>
            </template>
            <p v-if="failed" class="text-xs text-error">
              {{ t('page.marketing.install.poll_error') }}
            </p>
          </div>
        </li>
      </ol>

      <aside class="flex flex-col gap-4">
        <section class="dms-card p-0">
          <header class="border-b border-default px-4 py-3">
            <DmsEyebrow :label="t('page.marketing.install.records_title')" />
          </header>
          <ul class="divide-y divide-default">
            <li
              v-for="record in RECORDS"
              :key="record"
              class="flex gap-3 px-4 py-3"
            >
              <UIcon
                :name="RECORD_ICONS[record]"
                class="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span>
                <span class="block text-sm font-medium text-highlighted">
                  {{ t(`page.marketing.install.records.${record}`) }}
                </span>
                <span class="block text-xs text-muted">
                  {{ t(`page.marketing.install.records.${record}_hint`) }}
                </span>
              </span>
            </li>
          </ul>
        </section>
        <section class="dms-card p-0">
          <header class="border-b border-default px-4 py-3">
            <DmsEyebrow :label="t('page.marketing.install.live_title')" />
          </header>
          <div class="flex flex-col gap-2 p-4">
            <p class="text-sm text-muted">
              {{ t('page.marketing.install.live_description') }}
            </p>
            <code
              class="rounded-lg border border-default px-3 py-2 font-mono text-xs text-toned"
            >
              dmsMarketing?.track("quote_requested")
            </code>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
