import { defineComponent, h } from 'vue'
import { defineDmsPlugin } from '#dms/frontend-module'
import FunnelStepsInput from '../components/FunnelStepsInput.vue'
import type { FunnelStepDraft } from '../composables/useFunnelSteps'
import { parseFunnelStepsValue } from '../composables/useFunnelSteps'

const MAX_PREVIEW_STEPS = 3

function renderStepsPreview(value: unknown): string {
  const steps = parseFunnelStepsValue(value)
  if (!steps.length) {
    return '—'
  }
  const items = steps.slice(0, MAX_PREVIEW_STEPS).map((step) => step.value)
  const remaining = steps.length - MAX_PREVIEW_STEPS
  const tail = remaining > 0 ? ` +${remaining}` : ''
  return `${items.join(' → ')}${tail}`
}

const FunnelStepsDisplay = defineComponent({
  name: 'FunnelStepsDisplay',
  props: {
    modelValue: {
      type: [Array, String] as unknown as () =>
        FunnelStepDraft[] | string | null,
      default: null,
    },
  },
  setup(props) {
    return () =>
      h(FunnelStepsInput, {
        modelValue: props.modelValue,
        disabled: true,
      })
  },
})

export default defineDmsPlugin(() => {
  const { registerDataType } = useDataTypes()
  registerDataType({
    id: 'marketing_funnel_steps',
    displayComponent: FunnelStepsDisplay,
    formatter: {
      default: (value: unknown) => renderStepsPreview(value),
    },
  })
})
