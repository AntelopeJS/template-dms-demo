<script setup lang="ts">
import { computed, ref } from 'vue'

// A JSON value as a tree, as DevTools previews a payload: objects and arrays
// fold, the first levels open; a folded branch renders nothing below it, so
// a large body stays light.
const props = withDefaults(
  defineProps<{
    value: unknown
    name?: string | number
    depth?: number
  }>(),
  { name: undefined, depth: 0 },
)

/** Levels open at first. */
const OPEN_DEPTH = 2

const { t } = useI18n()

const isBranch = computed(
  () => props.value !== null && typeof props.value === 'object',
)
const isArray = computed(() => Array.isArray(props.value))
const entries = computed(() =>
  isBranch.value ? Object.entries(props.value as object) : [],
)
const open = ref(props.depth < OPEN_DEPTH)

const summary = computed(() => {
  const count = entries.value.length
  return isArray.value
    ? `[ ${t('api.request.json_items', { count }, count)} ]`
    : `{ ${t('api.request.json_keys', { count }, count)} }`
})

const leaf = computed(() => JSON.stringify(props.value))
const leafTone = computed(() => {
  if (props.value === null) return 'text-dimmed'
  if (typeof props.value === 'string') return 'text-success'
  if (typeof props.value === 'number') return 'text-info'
  return 'text-warning'
})
</script>

<template>
  <div class="font-mono text-[12px] leading-relaxed">
    <template v-if="isBranch">
      <button
        type="button"
        class="hover:bg-elevated inline-flex max-w-full items-center gap-1 rounded px-0.5 text-left"
        :aria-expanded="open"
        @click="open = !open"
      >
        <UIcon
          :name="open ? 'i-ph-caret-down' : 'i-ph-caret-right'"
          class="text-dimmed size-3 shrink-0"
          aria-hidden="true"
        />
        <span v-if="name !== undefined" class="text-muted">
          <bdi class="after:content-[':']">{{ name }}</bdi>
        </span>
        <span class="text-dimmed">{{ summary }}</span>
      </button>
      <div v-if="open" class="border-default ml-1.5 border-l pl-3">
        <ApiJsonTree
          v-for="[key, child] in entries"
          :key="key"
          :name="isArray ? Number(key) : key"
          :value="child"
          :depth="depth + 1"
        />
      </div>
    </template>
    <div v-else class="flex gap-1 pl-4 [overflow-wrap:anywhere]">
      <span v-if="name !== undefined" class="text-muted shrink-0">
        <bdi class="after:content-[':']">{{ name }}</bdi>
      </span>
      <bdi :class="leafTone">{{ leaf }}</bdi>
    </div>
  </div>
</template>
