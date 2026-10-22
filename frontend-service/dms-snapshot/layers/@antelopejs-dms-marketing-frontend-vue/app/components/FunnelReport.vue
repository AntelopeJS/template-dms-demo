<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDmsRoute, useDmsRouter, useI18n } from '#dms/frontend-module'
import { useMarketingContext } from '../composables/useMarketingContext'
import {
  useMarketingApi,
  type MarketingExperimentStatus,
  type MarketingFunnelResults,
} from '../composables/useMarketingApi'
import {
  funnelBuilderLink,
  funnelsLink,
} from '../composables/useMarketingRoutes'
import { useContextLink } from '../composables/useContextLink'
import { formatShortDate } from '../utils/format'
import { MS_PER_DAY, fractionDigits } from '../constants'

/**
 * The page of one funnel (`?id=`): its title and actions, then the funnel
 * report, or the A/B test report once the funnel carries a started split.
 * Reads the results with the period scope; a split ignores the period and is
 * read over its own runs, which its subtitle says.
 *
 * The report belongs to the funnel's website: opened under another one (a
 * link, the reader's saved site), the page URL is put on the funnel's; a site
 * picked in the bar afterwards leads to that site's funnels.
 */
const props = withDefaults(
  defineProps<{
    periodScope?: string
    componentId?: string
    pageId?: string
  }>(),
  { periodScope: undefined, componentId: undefined, pageId: undefined },
)

const MS_PER_HOUR = 3_600_000
const HTTP_NOT_FOUND = 404

const { t, locale } = useI18n()
const route = useDmsRoute()
const router = useDmsRouter()
const api = useMarketingApi()
const context = useMarketingContext()
const toast = useToast()
const { confirm } = useConfirm()
const { confirmFrom } = useConfirmFrom()

const funnelId = computed(() => {
  const id = route.query.id
  return typeof id === 'string' ? id : ''
})

/** In the page's own context: website and period follow the link. */
const inContext = useContextLink()

const reloadToken = ref(0)

// The id is read off the URL on every request, so another `?id=` opened in
// the same page reads that funnel, not the one first mounted.
const { data, isLoading, error, refresh } =
  useChartFetch<MarketingFunnelResults>({
    fetchUrl: '/api/marketing/funnels/{{query.id}}/results',
    periodScope: props.periodScope,
    watchSource: () => reloadToken.value,
  })

/** Data of the funnel the URL names: a previous one's is not shown under it. */
const current = computed(() =>
  data.value?.funnel._id === funnelId.value ? data.value : null,
)
const funnel = computed(() => current.value?.funnel ?? null)
const experiment = computed(() => funnel.value?.experiment ?? null)
const status = computed<MarketingExperimentStatus | null>(
  () => experiment.value?.status ?? null,
)
const isSplit = computed(() => experiment.value !== null)
const notFound = computed(
  () => !current.value && apiErrorStatus(error.value) === HTTP_NOT_FOUND,
)

const websiteName = computed(
  () =>
    context.websites.value.find((site) => site.id === funnel.value?.websiteId)
      ?.name ?? '',
)

// --- Website -------------------------------------------------------------------

/** The funnel the page URL was last put on the website of. */
const aligned = ref<string | null>(null)

watch(
  [funnel, () => context.selected.value?.id],
  ([shown, selected]) => {
    if (!shown || !selected || shown.websiteId === selected) {
      if (shown && shown.websiteId === selected) {
        aligned.value = shown._id
      }
      return
    }
    if (aligned.value !== shown._id) {
      // Opened under another site: the funnel's own, without a history entry
      // and without saving it as the reader's site.
      aligned.value = shown._id
      void router.replace({
        query: { ...route.query, website: shown.websiteId },
      })
      return
    }
    // A site picked in the bar: this funnel is not one of its funnels.
    void router.push(inContext(funnelsLink()))
  },
  { immediate: true },
)

// --- Subtitle ------------------------------------------------------------------

function runDays(since: number, until: number): string {
  const days = Math.floor((until - since) / MS_PER_DAY)
  return days < 1
    ? t('page.marketing.funnel.run_today')
    : t('page.marketing.funnel.run_days', { days }, days)
}

const subtitle = computed(() => {
  const shown = funnel.value
  const results = current.value
  if (!shown || !results) {
    return ''
  }
  const split = experiment.value
  const website = websiteName.value
  if (split && split.status !== 'draft') {
    const { since, until } = results.window
    return t(`page.marketing.funnel.subtitle_${split.status}`, {
      key: split.key,
      website,
      date: formatShortDate(since, locale.value),
      until: formatShortDate(until, locale.value),
      days: runDays(since, until),
    })
  }
  if (split) {
    return t('page.marketing.funnel.subtitle_draft', {
      key: split.key,
      website,
    })
  }
  return t('page.marketing.funnel.subtitle', {
    steps: shown.steps.length,
    hours: Math.round(shown.conversionWindowMs / MS_PER_HOUR),
    website,
  })
})

// --- Lifecycle -------------------------------------------------------------------

const changing = ref(false)

async function writeStatus(target: MarketingExperimentStatus): Promise<void> {
  const shown = funnel.value
  const split = experiment.value
  if (!shown || !split) {
    return
  }
  changing.value = true
  try {
    await api.updateFunnel(shown._id, {
      websiteId: shown.websiteId,
      name: shown.name,
      steps: shown.steps,
      conversionWindowHours: Math.round(shown.conversionWindowMs / MS_PER_HOUR),
      experiment: { ...split, status: target },
    })
    toast.add({
      color: 'success',
      title: t(`page.marketing.funnel.lifecycle.${target}_done`),
    })
    reloadToken.value++
  } catch {
    toast.add({
      color: 'error',
      title: t('page.marketing.funnel.lifecycle.error'),
    })
  } finally {
    changing.value = false
  }
}

/** Steps the site never sent over the period, while it sent other events;
 * a read cut at its cap concludes nothing. */
const unseenSteps = computed(() => {
  const computation = current.value?.computation
  if (!computation || computation.events === 0 || current.value?.truncated) {
    return []
  }
  return computation.steps
    .filter((row) => row.matches === 0)
    .map((row) => row.step.value)
})

async function start(): Promise<void> {
  const split = experiment.value
  if (!split || !funnel.value) {
    return
  }
  const total =
    split.variations.reduce((sum, arm) => sum + Math.max(arm.weight, 0), 0) || 1
  const shares = split.variations
    .map(
      (arm) =>
        `${arm.key} ${formatPercentage(Math.max(arm.weight, 0) / total, locale.value, fractionDigits(0))}`,
    )
    .join(' · ')
  await confirm({
    title: t('page.marketing.funnel.lifecycle.start_title', {
      name: funnel.value.name,
    }),
    description: t('page.marketing.funnel.lifecycle.start_description', {
      website: websiteName.value,
    }),
    color: 'success',
    icon: 'i-ph-play',
    confirmLabel: t('page.marketing.funnel.lifecycle.start_confirm'),
    impact: [
      ...unseenSteps.value.map((step) => ({
        icon: 'i-ph-warning',
        label: t('page.marketing.funnel.lifecycle.start_unseen', {
          step,
          website: websiteName.value,
        }),
      })),
      {
        icon: 'i-ph-lock-simple',
        label: t('page.marketing.funnel.lifecycle.start_freezes', {
          key: split.key,
          shares,
        }),
      },
      {
        icon: 'i-ph-arrows-clockwise',
        label: t('page.marketing.funnel.lifecycle.start_rescored'),
      },
      {
        icon: 'i-ph-code',
        label: t('page.marketing.funnel.lifecycle.start_code', {
          key: split.key,
        }),
      },
    ],
    onConfirm: () => writeStatus('running'),
  })
}

/** What the reading says at the moment of stopping, in a line: the report's
 * own verdict, so a test too early to call never names a winner. */
const readingAtStop = computed(() => {
  const verdict = current.value?.verdict
  const arms = current.value?.experiment?.variations ?? []
  const leader = verdict?.leader ?? null
  const best = leader === null ? undefined : arms[leader]
  const kind = verdict?.kind ?? 'withheld'
  if (
    (kind === 'winner' || kind === 'loser') &&
    best !== undefined &&
    best.uplift !== null
  ) {
    return t(`page.marketing.funnel.lifecycle.stop_reading_${kind}`, {
      key: best.key,
      lift: formatPercentage(
        Math.abs(best.uplift),
        locale.value,
        fractionDigits(1),
      ),
    })
  }
  if (kind === 'early' || kind === 'withheld') {
    return t(`page.marketing.funnel.lifecycle.stop_reading_${kind}`)
  }
  return t('page.marketing.funnel.lifecycle.stop_reading_flat')
})

async function stop(): Promise<void> {
  const shown = funnel.value
  const split = experiment.value
  if (!shown || !split) {
    return
  }
  await confirm({
    title: t('page.marketing.funnel.lifecycle.stop_title'),
    description: t('page.marketing.funnel.lifecycle.stop_description'),
    color: 'warning',
    icon: 'i-ph-stop',
    confirmLabel: t('page.marketing.funnel.lifecycle.stop_confirm'),
    impact: [
      { icon: 'i-ph-scales', label: readingAtStop.value },
      {
        icon: 'i-ph-hourglass',
        label: t('page.marketing.funnel.lifecycle.stop_settles', {
          hours: Math.round(shown.conversionWindowMs / MS_PER_HOUR),
        }),
      },
      {
        icon: 'i-ph-code',
        label: t('page.marketing.funnel.lifecycle.stop_code', {
          key: split.key,
        }),
      },
    ],
    onConfirm: () => writeStatus('stopped'),
  })
}

async function resume(): Promise<void> {
  await confirm({
    title: t('page.marketing.funnel.lifecycle.resume_title'),
    description: t('page.marketing.funnel.lifecycle.resume_description'),
    confirmLabel: t('page.marketing.funnel.lifecycle.resume_confirm'),
    onConfirm: () => writeStatus('running'),
  })
}

/** Worded by the server, as the funnels table's own Delete. */
const DELETE_CONFIRMATION_URL =
  '/api/marketing/funnels/{{row.id}}/delete-confirmation'

async function remove(): Promise<void> {
  const shown = funnel.value
  if (!shown) {
    return
  }
  await confirmFrom(DELETE_CONFIRMATION_URL, {
    params: { id: shown._id },
    onConfirm: async () => {
      await api.deleteFunnel(shown._id)
      toast.add({
        color: 'success',
        title: t('page.marketing.funnel.delete.done'),
      })
      await router.push(inContext(funnelsLink()))
    },
  })
}

const moreItems = computed(() => [
  [
    {
      label: t('page.marketing.funnel.duplicate'),
      icon: 'i-ph-copy',
      to: funnel.value
        ? inContext(funnelBuilderLink(null, { copy: funnel.value._id }))
        : undefined,
    },
  ],
  [
    {
      label: t('page.marketing.funnel.delete.action'),
      icon: 'i-ph-trash',
      color: 'error' as const,
      onSelect: () => void remove(),
    },
  ],
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex flex-wrap items-start gap-4">
      <UButton
        icon="i-ph-arrow-left"
        color="neutral"
        variant="ghost"
        :to="inContext(funnelsLink())"
        :aria-label="t('page.marketing.funnel.back')"
      />
      <div class="min-w-[min(16rem,100%)] flex-1">
        <USkeleton v-if="!funnel && !notFound && !error" class="h-8 w-72" />
        <h1
          v-else
          class="flex flex-wrap items-center gap-2 text-2xl font-semibold text-highlighted"
        >
          {{ funnel?.name ?? t('page.marketing.funnel.title') }}
          <DmsStatusPill
            v-if="funnel"
            size="sm"
            uppercase
            :icon="isSplit ? 'i-ph-flask' : 'i-ph-funnel'"
            :label="
              t(
                isSplit
                  ? 'page.marketing.funnel.kind_ab'
                  : 'page.marketing.funnel.kind_funnel',
              )
            "
          />
          <DmsStatusPill
            v-if="status"
            size="sm"
            :tone="
              status === 'running'
                ? 'success'
                : status === 'draft'
                  ? 'info'
                  : 'neutral'
            "
            :dot="status === 'running' ? 'pulse' : 'static'"
            :label="t(`page.marketing.funnels.status.${status}`)"
          />
        </h1>
        <p v-if="subtitle" class="mt-1 max-w-3xl text-sm text-muted">
          {{ subtitle }}
        </p>
      </div>
      <div v-if="funnel" class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-pencil-simple"
          color="neutral"
          variant="outline"
          :label="
            t(
              isSplit
                ? 'page.marketing.funnel.edit'
                : 'page.marketing.funnel.edit_steps',
            )
          "
          :to="inContext(funnelBuilderLink(funnel._id))"
        />
        <UButton
          v-if="!isSplit"
          icon="i-ph-flask"
          color="neutral"
          variant="outline"
          :label="t('page.marketing.funnel.split')"
          :to="inContext(funnelBuilderLink(funnel._id, { split: true }))"
        />
        <UButton
          v-if="status === 'draft'"
          icon="i-ph-play"
          color="success"
          :loading="changing"
          :label="t('page.marketing.funnel.lifecycle.start')"
          @click="start"
        />
        <UButton
          v-else-if="status === 'running'"
          icon="i-ph-stop"
          color="warning"
          variant="outline"
          :loading="changing"
          :label="t('page.marketing.funnel.lifecycle.stop')"
          @click="stop"
        />
        <UButton
          v-else-if="status === 'stopped'"
          icon="i-ph-play"
          color="neutral"
          variant="outline"
          :loading="changing"
          :label="t('page.marketing.funnel.lifecycle.resume')"
          @click="resume"
        />
        <UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
          <UButton
            icon="i-ph-dots-three"
            color="neutral"
            variant="outline"
            :aria-label="t('page.marketing.common.more')"
          />
        </UDropdownMenu>
      </div>
    </header>

    <DmsEmptyState
      v-if="notFound"
      icon="i-ph-funnel"
      hatched
      class="dms-card"
      :title="t('page.marketing.errors.funnel_not_found')"
      :description="t('page.marketing.funnel.not_found_description')"
    >
      <template #actions>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-arrow-left"
          :label="t('page.marketing.funnel.back')"
          :to="inContext(funnelsLink())"
        />
      </template>
    </DmsEmptyState>

    <DmsEmptyState
      v-else-if="error && !current"
      variant="error"
      class="dms-card"
      :title="t('page.marketing.funnel.error')"
      :description="t('page.marketing.common.data_safe')"
    >
      <template #actions>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-ph-arrow-clockwise"
          :label="t('page.marketing.common.retry')"
          @click="refresh"
        />
      </template>
    </DmsEmptyState>

    <div v-else-if="!current" class="grid gap-4 md:grid-cols-4">
      <USkeleton v-for="index in 4" :key="index" class="h-24 rounded-xl" />
      <USkeleton class="h-80 rounded-xl md:col-span-4" />
    </div>

    <DmsMarketingExperimentReport
      v-else-if="isSplit && status !== 'draft'"
      :results="current"
      :loading="isLoading"
      :website-name="websiteName"
    />

    <DmsMarketingFunnelFigure
      v-else
      :results="current"
      :loading="isLoading"
      :website-name="websiteName"
    />
  </div>
</template>
