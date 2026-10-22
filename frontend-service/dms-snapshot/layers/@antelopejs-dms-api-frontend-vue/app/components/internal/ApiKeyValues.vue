<script setup lang="ts">
import { computed } from 'vue'

// Headers or parameters as a two-column list of names and values. A name
// stays on one line; a long value wraps between words where it can.
const props = defineProps<{
  values: Record<string, unknown> | undefined | null
  empty: string
}>()

const entries = computed(() =>
  Object.entries(props.values ?? {}).map(([name, value]) => [
    name,
    typeof value === 'string' ? value : JSON.stringify(value),
  ]),
)
</script>

<template>
  <p v-if="entries.length === 0" class="text-dimmed text-sm">{{ empty }}</p>
  <table
    v-else
    class="border-default w-full border-separate border-spacing-0 overflow-hidden rounded-md border font-mono text-[12px]"
  >
    <tbody>
      <tr v-for="[name, value] in entries" :key="name">
        <th
          scope="row"
          class="text-muted border-default w-px whitespace-nowrap border-b px-3 py-1.5 text-left align-top font-normal"
        >
          <bdi>{{ name }}</bdi>
        </th>
        <td
          class="text-default border-default border-b px-3 py-1.5 [overflow-wrap:anywhere]"
        >
          <bdi>{{ value }}</bdi>
        </td>
      </tr>
    </tbody>
  </table>
</template>
