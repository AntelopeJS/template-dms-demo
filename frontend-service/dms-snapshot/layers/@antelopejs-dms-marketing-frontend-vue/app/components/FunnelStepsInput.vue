<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#dms/frontend-module'
import { MAX_STEP_VALUE_LENGTH } from '../utils/funnel-draft'
import {
  parseFunnelStepsValue,
  type FunnelStepDraft,
} from '../composables/useFunnelSteps'

/**
 * Form input for the marketing_funnel_steps DataType: an ordered list of
 * {kind, value} steps, emitted as the array itself so the client-side zod
 * schema and the write path both see the real type (a JSON string would be
 * persisted raw). Bounds mirror the backend MIN/MAX_FUNNEL_STEPS.
 */
interface StepKindMeta {
  label: string
  placeholder: string
}

const MIN_STEPS = 1
const MAX_STEPS = 10

const props = defineProps<{
  modelValue?: FunnelStepDraft[] | string | null
  initialValue?: FunnelStepDraft[] | string | null
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: FunnelStepDraft[]] }>()

const { t } = useI18n()

// Computed so labels follow live locale switches (t() at setup would freeze).
const stepKindMeta = computed<Record<FunnelStepDraft['kind'], StepKindMeta>>(
  () => ({
    url: {
      label: t('page.marketing.funnels.step_kind.url'),
      placeholder: t('page.marketing.funnels.form.url_placeholder'),
    },
    custom: {
      label: t('page.marketing.funnels.step_kind.custom'),
      placeholder: t('page.marketing.funnels.form.event_placeholder'),
    },
  }),
)

const stepKindItems = computed(() =>
  Object.entries(stepKindMeta.value).map(([value, meta]) => ({
    label: meta.label,
    value,
  })),
)

function emptyStep(): FunnelStepDraft {
  return { kind: 'url', value: '' }
}

function parseValue(
  raw: FunnelStepDraft[] | string | null | undefined,
): FunnelStepDraft[] {
  // Copies, not references: the drafts are mutated by the inputs below and
  // must never write through to the prop value.
  const steps = parseFunnelStepsValue(raw).map((step) => ({ ...step }))
  while (steps.length < MIN_STEPS) {
    steps.push(emptyStep())
  }
  return steps
}

const steps = ref<FunnelStepDraft[]>(
  parseValue(props.modelValue ?? props.initialValue),
)

// Values are emitted untrimmed — trimming here would eat spaces mid-typing
// through the v-model echo; the DataType schema trims server-side.
function onEdit(): void {
  emit(
    'update:modelValue',
    steps.value.map((step) => ({ kind: step.kind, value: step.value })),
  )
}

function addStep(): void {
  if (steps.value.length >= MAX_STEPS) {
    return
  }
  steps.value.push(emptyStep())
  onEdit()
}

function removeStep(index: number): void {
  if (steps.value.length <= MIN_STEPS) {
    return
  }
  steps.value.splice(index, 1)
  onEdit()
}

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseValue(value)
    if (JSON.stringify(parsed) !== JSON.stringify(steps.value)) {
      steps.value = parsed
    }
  },
)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="(step, index) in steps"
      :key="index"
      class="flex items-center gap-2"
    >
      <USelect
        v-model="step.kind"
        :items="stepKindItems"
        :disabled="props.disabled"
        class="w-32"
        size="sm"
        @update:model-value="onEdit"
      />
      <UInput
        v-model="step.value"
        :placeholder="stepKindMeta[step.kind].placeholder"
        :maxlength="MAX_STEP_VALUE_LENGTH"
        :disabled="props.disabled"
        class="flex-1"
        size="sm"
        @update:model-value="onEdit"
      />
      <UButton
        v-if="!props.disabled"
        icon="i-ph-x"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="steps.length <= MIN_STEPS"
        @click="removeStep(index)"
      />
    </div>
    <UButton
      v-if="!props.disabled && steps.length < MAX_STEPS"
      icon="i-ph-plus"
      :label="t('page.marketing.funnels.form.add_step')"
      color="neutral"
      variant="subtle"
      size="sm"
      class="self-start"
      @click="addStep"
    />
  </div>
</template>
