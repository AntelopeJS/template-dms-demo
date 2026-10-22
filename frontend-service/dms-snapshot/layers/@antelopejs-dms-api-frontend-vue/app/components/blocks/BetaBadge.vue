<script setup lang="ts">
// The console is still in beta: a pill at the head of the page's toolbar,
// its explanation in a tooltip, rather than a banner across the page.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
</script>

<template>
  <UTooltip :text="t('api.overview.beta.description')">
    <UBadge
      color="info"
      variant="soft"
      size="sm"
      tabindex="0"
      :label="t('api.overview.beta.title')"
      :aria-label="`${t('api.overview.beta.title')} · ${t('api.overview.beta.description')}`"
    />
  </UTooltip>
</template>
