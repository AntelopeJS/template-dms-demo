<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#dms/frontend-module'
import { MAX_EXPERIMENT_KEY_LENGTH } from '../utils/funnel-draft'
import {
  parseExperimentVariationsValue,
  type ExperimentVariationDraft,
} from '../composables/useExperiment'
import { fractionDigits } from '../constants'

/**
 * The arms of an experiment, inside DmsMarketingExperimentInput: a list of
 * {key, weight} rows emitted as the array itself. Bounds mirror the backend
 * MIN/MAX_EXPERIMENT_VARIATIONS; the first arm is the control.
 */
const MIN_VARIATIONS = 2
const MAX_VARIATIONS = 8
const DEFAULT_WEIGHT = 1

const props = defineProps<{
  modelValue?: ExperimentVariationDraft[] | string | null
  initialValue?: ExperimentVariationDraft[] | string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ExperimentVariationDraft[]]
}>()

const { t, locale } = useI18n()

function emptyVariation(): ExperimentVariationDraft {
  return { key: '', weight: DEFAULT_WEIGHT }
}

function parseValue(
  raw: ExperimentVariationDraft[] | string | null | undefined,
): ExperimentVariationDraft[] {
  // Copies, not references: the drafts are mutated by the inputs below and
  // must never write through to the prop value.
  const variations = parseExperimentVariationsValue(raw).map((variation) => ({
    ...variation,
  }))
  while (variations.length < MIN_VARIATIONS) {
    variations.push(emptyVariation())
  }
  return variations
}

const variations = ref<ExperimentVariationDraft[]>(
  parseValue(props.modelValue ?? props.initialValue),
)

const totalWeight = computed(() =>
  variations.value.reduce(
    (sum, variation) => sum + Math.max(variation.weight || 0, 0),
    0,
  ),
)

function sharePercent(variation: ExperimentVariationDraft): number {
  // No weight above 0 serves nobody: the save refuses it, the bars say so.
  if (totalWeight.value <= 0) {
    return 0
  }
  return Math.round(
    (Math.max(variation.weight || 0, 0) / totalWeight.value) * 100,
  )
}

// Values are emitted untrimmed — trimming here would eat characters
// mid-typing through the v-model echo; the DataType schema trims server-side.
function onEdit(): void {
  emit(
    'update:modelValue',
    variations.value.map((variation) => ({
      key: variation.key,
      weight: variation.weight,
    })),
  )
}

function addVariation(): void {
  if (variations.value.length >= MAX_VARIATIONS) {
    return
  }
  variations.value.push(emptyVariation())
  onEdit()
}

function removeVariation(index: number): void {
  if (variations.value.length <= MIN_VARIATIONS) {
    return
  }
  variations.value.splice(index, 1)
  onEdit()
}

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseValue(value)
    if (JSON.stringify(parsed) !== JSON.stringify(variations.value)) {
      variations.value = parsed
    }
  },
)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="(variation, index) in variations"
      :key="index"
      class="flex items-center gap-2"
    >
      <UBadge
        v-if="index === 0"
        :label="t('page.marketing.funnels.results.control')"
        color="neutral"
        variant="subtle"
        size="sm"
        class="w-16 justify-center shrink-0"
      />
      <span v-else class="w-16 shrink-0" />
      <UInput
        v-model="variation.key"
        :placeholder="t('page.marketing.funnels.form.variation_key')"
        :maxlength="MAX_EXPERIMENT_KEY_LENGTH"
        :disabled="props.disabled"
        class="flex-1 font-mono"
        size="sm"
        @update:model-value="onEdit"
      />
      <UInput
        v-model.number="variation.weight"
        type="number"
        min="0"
        :disabled="props.disabled"
        class="w-20"
        size="sm"
        @update:model-value="onEdit"
      />
      <span class="w-10 shrink-0 text-right text-xs text-muted">
        {{
          formatPercentage(
            sharePercent(variation) / 100,
            locale,
            fractionDigits(0),
          )
        }}
      </span>
      <UButton
        v-if="!props.disabled"
        icon="i-ph-x"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="variations.length <= MIN_VARIATIONS"
        @click="removeVariation(index)"
      />
    </div>
    <UButton
      v-if="!props.disabled && variations.length < MAX_VARIATIONS"
      icon="i-ph-plus"
      :label="t('page.marketing.funnels.form.add_variation')"
      color="neutral"
      variant="subtle"
      size="sm"
      class="self-start"
      @click="addVariation"
    />
  </div>
</template>
