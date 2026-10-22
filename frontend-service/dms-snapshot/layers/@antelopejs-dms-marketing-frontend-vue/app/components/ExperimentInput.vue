<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#dms/frontend-module'
import { MAX_EXPERIMENT_KEY_LENGTH } from '../utils/funnel-draft'
import {
  parseExperimentValue,
  type ExperimentDraft,
  type ExperimentVariationDraft,
} from '../composables/useExperiment'

/**
 * Form input for the marketing_experiment DataType: the A/B facet of a
 * funnel, off by default. On, it holds the key page code asks for and the
 * weighted arms; the status rides along untouched — only the detail pane's
 * lifecycle buttons move it. Emitted as the object itself (a JSON string
 * would be persisted raw), null when off. Key and arms lock once the status
 * has left draft, mirroring the backend rule.
 */
const DEFAULT_WEIGHT = 1

const props = defineProps<{
  modelValue?: ExperimentDraft | string | null
  initialValue?: ExperimentDraft | string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ExperimentDraft | null]
}>()

const { t } = useI18n()

/** Two blank arms, so the toggle lands on a form the arms input also shows. */
function emptyDraft(): ExperimentDraft {
  return {
    key: '',
    variations: [
      { key: '', weight: DEFAULT_WEIGHT },
      { key: '', weight: DEFAULT_WEIGHT },
    ],
    // A draft has served no traffic; the backend re-derives them anyway.
    runs: [],
  }
}

const initial = parseExperimentValue(props.modelValue ?? props.initialValue)
const enabled = ref(initial !== null)
const draft = ref<ExperimentDraft>(initial ?? emptyDraft())

const locked = computed(
  () => draft.value.status !== undefined && draft.value.status !== 'draft',
)
const inputsDisabled = computed(() => props.disabled || locked.value)

function currentValue(): ExperimentDraft | null {
  if (!enabled.value) {
    return null
  }
  return {
    ...draft.value,
    variations: draft.value.variations.map((variation) => ({ ...variation })),
  }
}

function onEdit(): void {
  emit('update:modelValue', currentValue())
}

function onVariationsEdit(variations: ExperimentVariationDraft[]): void {
  draft.value.variations = variations
  onEdit()
}

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseExperimentValue(value)
    if (JSON.stringify(parsed) !== JSON.stringify(currentValue())) {
      enabled.value = parsed !== null
      draft.value = parsed ?? emptyDraft()
    }
  },
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <USwitch
      v-model="enabled"
      :label="t('page.marketing.funnels.form.experiment_toggle')"
      :disabled="props.disabled || locked"
      @update:model-value="onEdit"
    />
    <template v-if="enabled">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-highlighted">
          {{ t('page.marketing.funnels.form.key_label') }}
        </span>
        <UInput
          v-model="draft.key"
          :placeholder="t('page.marketing.funnels.form.key')"
          :maxlength="MAX_EXPERIMENT_KEY_LENGTH"
          :disabled="inputsDisabled"
          class="font-mono"
          size="sm"
          @update:model-value="onEdit"
        />
        <p class="text-xs text-muted">
          {{ t('page.marketing.funnels.form.key_description') }}
        </p>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-highlighted">
          {{ t('page.marketing.funnels.form.variations') }}
        </span>
        <DmsMarketingVariationsInput
          :model-value="draft.variations"
          :disabled="inputsDisabled"
          @update:model-value="onVariationsEdit"
        />
        <p class="text-xs text-muted">
          {{ t('page.marketing.funnels.form.variations_description') }}
        </p>
      </div>
      <p v-if="locked" class="text-xs text-warning">
        {{ t('page.marketing.funnels.locked_hint') }}
      </p>
    </template>
  </div>
</template>
