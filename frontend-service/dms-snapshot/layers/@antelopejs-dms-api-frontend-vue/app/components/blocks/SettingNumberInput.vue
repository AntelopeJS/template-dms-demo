<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// A number of the Settings form (the request logs' retention, the body cap,
// the slow threshold), drawn by the DMS number input at the width of a
// number. The input keeps a typed value within its bounds and on its steps
// when it is left: 1020 typed for steps of 50 becomes 1,000. The field then
// shows the value it holds, never the one typed, and says why it changed
// (the input's `adjust`). The form brings it into view and focuses it from a
// link to its anchor (`…/settings#requestLogMaxBodyKb`).
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  id?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>()
const model = defineModel<number | null | undefined>()

const { t } = useI18n()
const { formatLocale, formatNumber } = useRegionalFormat({ locale: 'format' })

// How the input changed what was typed, until the value changes again.
const adjustment = ref<InputNumberAdjustment | null>(null)

watch(model, (value) => {
  if (value !== adjustment.value?.value) adjustment.value = null
})

const adjustmentText = computed(() => {
  const current = adjustment.value
  if (!current) return ''
  return t(`api.settings.number.adjusted_${current.reason}`, {
    typed: formatNumber(current.typed),
    value: formatNumber(current.value),
    step: formatNumber(props.step ?? 1),
  })
})
</script>

<template>
  <div class="grid gap-1.5">
    <DmsInputNumber
      :id="props.id"
      v-model="model"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :locale="formatLocale"
      :disabled="props.disabled"
      class="w-40"
      @adjust="adjustment = $event"
    />
    <p
      v-if="adjustmentText"
      class="text-muted flex items-start gap-1.5 text-xs"
      role="status"
    >
      <UIcon name="i-ph-info" class="mt-px size-3.5 shrink-0" />
      <span>{{ adjustmentText }}</span>
    </p>
  </div>
</template>
