<script setup lang="ts">
// Marks a request the console's tester sent: it is kept in the logs, out of
// the statistics and the health.
const { t } = useI18n()
</script>

<template>
  <UBadge
    size="sm"
    color="info"
    variant="subtle"
    icon="i-ph-paper-plane-tilt"
    :label="t('api.request.tester')"
    :title="t('api.request.source_tester')"
    class="shrink-0"
  />
</template>
