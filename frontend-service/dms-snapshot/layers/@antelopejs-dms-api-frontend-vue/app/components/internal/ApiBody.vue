<script setup lang="ts">
import { computed, ref } from 'vue'
import { byteLength, formatBytes } from '../../utils/format'
import { bodyOmission } from '../../utils/requestDrawer'
import ApiJsonTree from './ApiJsonTree.vue'

// A captured body: a JSON one as a tree (or as text, on demand), anything
// else as text. Its label says how much was kept of how much was sent; no
// body says why none was stored.
const props = withDefaults(
  defineProps<{
    body?: string | null
    truncated?: boolean
    /** Why no body was stored, as the API names it. */
    omitted?: string | null
    /** The size the body had before it was cut, in bytes. */
    originalSize?: number
    /** The request's method: GET and HEAD send no body. */
    method?: string
    kind: 'request' | 'response'
  }>(),
  {
    body: undefined,
    truncated: false,
    omitted: undefined,
    originalSize: undefined,
    method: undefined,
  },
)

/** Methods that send no body. */
const BODILESS_METHODS = ['GET', 'HEAD']
/** Where the body capture is set. */
const BODY_SETTINGS_LINK = '/modules/api/settings#requestLogMaxBodyKb'

const { t } = useI18n()
const { formatLocale: locale } = useRegionalFormat({ locale: 'format' })

const parsed = computed<{ value: unknown } | undefined>(() => {
  if (!props.body) return undefined
  try {
    return { value: JSON.parse(props.body) }
  } catch {
    return undefined
  }
})
const text = computed(() =>
  parsed.value
    ? JSON.stringify(parsed.value.value, null, 2)
    : (props.body ?? ''),
)
const raw = ref(false)

const label = computed(() => {
  const kept = formatBytes(byteLength(props.body ?? ''), locale.value)
  const size = props.originalSize
    ? t('api.request.body_size_of', {
        kept,
        total: formatBytes(props.originalSize, locale.value),
      })
    : kept
  const cut = props.truncated ? ` · ${t('api.request.truncated')}` : ''
  return `${parsed.value ? 'JSON' : 'TEXT'} · ${size}${cut}`
})

const omission = computed(() => bodyOmission(props.omitted))
const bodiless = computed(
  () =>
    props.kind === 'request' &&
    BODILESS_METHODS.includes((props.method ?? '').toUpperCase()),
)
const reason = computed(() => {
  if (omission.value)
    return t(`api.request.body_omitted.${omission.value.replace('-', '_')}`)
  if (bodiless.value)
    return t('api.request.no_body_method', {
      method: (props.method ?? '').toUpperCase(),
    })
  return t('api.request.no_body')
})
// What the settings change: whether bodies are captured, and up to what size.
const toSettings = computed(
  () =>
    !bodiless.value &&
    (omission.value === null ||
      omission.value === 'disabled' ||
      omission.value === 'too-large'),
)
</script>

<template>
  <div
    v-if="body"
    class="border-default bg-elevated/40 overflow-hidden rounded-md border"
  >
    <div
      class="border-default text-dimmed flex items-center gap-2 border-b px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em]"
    >
      <span class="min-w-0 grow truncate">{{ label }}</span>
      <UButton
        v-if="parsed"
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="raw ? 'i-ph-tree-view' : 'i-ph-text-align-left'"
        :label="raw ? t('api.request.view_tree') : t('api.request.view_raw')"
        @click="raw = !raw"
      />
      <DmsCopyButton :value="text" />
    </div>
    <div v-if="parsed && !raw" class="max-h-[60vh] overflow-auto px-2 py-2">
      <ApiJsonTree :value="parsed.value" />
    </div>
    <pre
      v-else
      class="text-default max-h-[60vh] overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[12px] leading-relaxed [overflow-wrap:anywhere]"
    ><code>{{ text }}</code></pre>
  </div>
  <p v-else class="text-dimmed text-sm">
    {{ reason }}
    <ULink
      v-if="toSettings"
      :to="BODY_SETTINGS_LINK"
      class="text-primary whitespace-nowrap hover:underline"
    >
      {{ t('api.request.body_settings') }}
    </ULink>
  </p>
</template>
