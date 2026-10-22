<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDmsRuntimeConfig, useI18n } from '#dms/frontend-module'
import { trackerSnippet, type SnippetFlavor } from '../utils/snippet'

/**
 * The tracker tag of one website in its three shapes (plain HTML, Nuxt,
 * Google Tag Manager), with a copy button.
 */
const props = defineProps<{ websiteId: string }>()

const FLAVORS: SnippetFlavor[] = ['html', 'nuxt', 'gtm']
const FILE_LABELS: Record<SnippetFlavor, string> = {
  html: 'index.html',
  nuxt: 'nuxt.config.ts',
  gtm: 'Tag Manager',
}

const { t } = useI18n()
const config = useDmsRuntimeConfig()

const flavor = ref<SnippetFlavor>('html')

// Read once mounted: the server renders with its internal backend URL, the
// browser with the public one — the tag must only ever show the latter.
const apiOrigin = ref('')
onMounted(() => {
  apiOrigin.value = String(
    (config.public as { dms?: { baseURL?: string } }).dms?.baseURL ?? '',
  )
})

const code = computed(() =>
  trackerSnippet(flavor.value, apiOrigin.value, props.websiteId),
)

const items = computed(() =>
  FLAVORS.map((value) => ({
    value,
    label: t(`page.marketing.install.flavors.${value}`),
  })),
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <DmsSegmented
      v-model="flavor"
      :items="items"
      size="sm"
      class="self-start"
    />
    <div class="overflow-hidden rounded-lg border border-default">
      <div
        class="flex items-center justify-between border-b border-default px-3 py-1.5"
      >
        <DmsEyebrow :label="FILE_LABELS[flavor]" />
        <DmsCopyButton :value="code" />
      </div>
      <pre
        class="overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed text-toned"
        >{{ code }}</pre>
    </div>
  </div>
</template>
