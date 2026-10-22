<script setup lang="ts">
import { useI18n } from '#dms/frontend-module'
import { installLink } from '../composables/useMarketingRoutes'

/**
 * The first run of the module, in place of a page's blocks while the tenant
 * tracks no website: what the module will show and the privacy stance, with
 * the one action that starts it.
 */
const { t } = useI18n()

const GHOST_TILES = 3
</script>

<template>
  <section
    class="dms-card grid items-center gap-8 overflow-hidden p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]"
  >
    <div class="flex flex-col items-start gap-4">
      <DmsStatusPill
        tone="primary"
        icon="i-ph-shield-check"
        :label="t('page.marketing.first_run.eyebrow')"
        uppercase
        size="sm"
      />
      <h2 class="text-2xl font-semibold text-balance text-highlighted">
        {{ t('page.marketing.first_run.title') }}
      </h2>
      <p class="max-w-prose text-sm text-muted">
        {{ t('page.marketing.first_run.description') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-plus"
          :label="t('page.marketing.first_run.add')"
          :to="installLink()"
        />
        <UButton
          icon="i-ph-book-open"
          color="neutral"
          variant="ghost"
          :label="t('page.marketing.first_run.how')"
          to="https://dms.antelopejs.com/docs/modules/marketing/usage/tracking"
          target="_blank"
        />
      </div>
    </div>
    <div class="hidden grid-cols-3 gap-3 opacity-60 lg:grid" aria-hidden="true">
      <div
        v-for="index in GHOST_TILES"
        :key="index"
        class="h-20 rounded-lg border border-dashed border-default"
      />
      <div
        class="col-span-3 h-32 rounded-lg border border-dashed border-default"
      />
    </div>
  </section>
</template>
