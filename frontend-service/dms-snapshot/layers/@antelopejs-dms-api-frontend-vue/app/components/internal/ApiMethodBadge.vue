<script setup lang="ts">
import { computed } from 'vue'
import { methodTone } from '../../utils/http'

// The method of a request or a route. Outline everywhere; `solid` only marks
// the request the tester is about to send.
const props = withDefaults(
  defineProps<{
    method: string
    solid?: boolean
    size?: 'sm' | 'md'
  }>(),
  { solid: false, size: 'md' },
)

const label = computed(() =>
  props.method.toUpperCase() === 'DELETE' ? 'DEL' : props.method.toUpperCase(),
)
</script>

<template>
  <DmsStatusPill
    :tone="methodTone(method)"
    :label="label"
    :variant="solid ? 'soft' : 'outline'"
    :size="size"
    dot="none"
    mono
    uppercase
    class="min-w-[3.25rem] justify-center"
    :title="method.toUpperCase()"
  />
</template>
