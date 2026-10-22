<script setup lang="ts">
import { computed } from 'vue'
import { useDmsRouter, useI18n } from '#dms/frontend-module'
import { useMarketingContext } from '../composables/useMarketingContext'
import type { MarketingFunnelStep } from '../composables/useMarketingApi'
import { useFunnelTemplates } from '../composables/useMarketingReads'
import {
  funnelBuilderLink,
  installLink,
} from '../composables/useMarketingRoutes'
import { useContextLink } from '../composables/useContextLink'
import { formatNumber } from '../utils/format'
import { PERIOD_SCOPE } from '../constants'

/**
 * The first-run state of the funnels table: funnels built from the site's
 * own journeys over the period (its most triggered events, each led by the
 * page its sessions viewed most often before it), and a blank start. A site
 * that sent nothing yet is sent to its install guide instead.
 */
const props = withDefaults(
  defineProps<{ state?: string; componentId?: string; pageId?: string }>(),
  { state: undefined, componentId: undefined, pageId: undefined },
)

void props

const { t, locale } = useI18n()
const inContext = useContextLink()
const router = useDmsRouter()
const context = useMarketingContext()
const period = usePeriodScope(PERIOD_SCOPE)

const templatesRead = useFunnelTemplates(
  () => context.selected.value?.id,
  period,
)
/**
 * The site's templates; `null` while they load (the previous site's or
 * period's included), none once the read failed.
 */
const templates = computed(() => {
  if (templatesRead.error.value && templatesRead.status.value !== 'pending') {
    return []
  }
  return templatesRead.placeholder.value ? null : templatesRead.data.value
})

/** The site has sent nothing yet: templates cannot come before the tracker. */
const waiting = computed(() => context.selected.value?.state === 'waiting')

function startFrom(steps: MarketingFunnelStep[] | null): void {
  void router.push(
    inContext(funnelBuilderLink(null, { steps: steps ?? undefined })),
  )
}

function stepsKey(steps: MarketingFunnelStep[]): string {
  return steps.map((step) => step.value).join('>')
}
</script>

<template>
  <section class="p-6">
    <DmsEmptyState
      icon="i-ph-funnel"
      hatched
      :card="false"
      :title="
        t('page.marketing.funnels.empty.title', {
          website: context.selected.value?.name ?? '',
        })
      "
      :description="
        t(
          waiting
            ? 'page.marketing.funnels.empty.description_waiting'
            : templates && templates.length === 0
              ? 'page.marketing.funnels.empty.description_none'
              : 'page.marketing.funnels.empty.description',
          { website: context.selected.value?.name ?? '' },
        )
      "
    >
      <template v-if="waiting" #actions>
        <UButton
          size="sm"
          icon="i-ph-plug"
          :label="t('page.marketing.funnels.empty.install')"
          :to="installLink(context.selected.value?.id)"
        />
      </template>
    </DmsEmptyState>
    <div class="mt-6 grid gap-3 md:grid-cols-3">
      <template v-if="templates === null && !waiting">
        <USkeleton v-for="index in 2" :key="index" class="h-32 rounded-xl" />
      </template>
      <button
        v-for="template in templates ?? []"
        :key="stepsKey(template.steps)"
        type="button"
        class="dms-card flex min-w-0 flex-col items-start gap-2 p-4 text-left transition-colors hover:border-primary"
        @click="startFrom(template.steps)"
      >
        <DmsEyebrow :label="t('page.marketing.funnels.empty.template')" />
        <span
          class="max-w-full truncate font-mono text-sm font-semibold text-highlighted"
        >
          {{ template.steps.at(-1)?.value }}
        </span>
        <span class="flex max-w-full flex-wrap items-center gap-1">
          <span
            v-for="step in template.steps"
            :key="step.value"
            class="max-w-full truncate rounded border px-1.5 py-0.5 font-mono text-[11px]"
            :class="
              step.kind === 'custom'
                ? 'border-primary/40 text-primary'
                : 'border-default text-toned'
            "
          >
            {{ step.value }}
          </span>
        </span>
        <span class="text-xs text-muted">
          {{
            t(
              'page.marketing.funnels.empty.entering',
              { count: formatNumber(template.entering, locale) },
              template.entering,
            )
          }}
        </span>
      </button>
      <button
        type="button"
        class="flex flex-col items-start gap-2 rounded-xl border border-dashed border-default p-4 text-left transition-colors hover:border-primary"
        @click="startFrom(null)"
      >
        <DmsEyebrow :label="t('page.marketing.funnels.empty.blank')" />
        <span class="text-sm font-semibold text-highlighted">
          {{ t('page.marketing.funnels.empty.scratch') }}
        </span>
        <span class="text-xs text-muted">
          {{ t('page.marketing.funnels.empty.scratch_description') }}
        </span>
      </button>
    </div>
  </section>
</template>
