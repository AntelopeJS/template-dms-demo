<script setup lang="ts">
import { computed } from 'vue'
import { parsePayload, prettyJson } from '../../utils/describe'

// A run's trigger payload, pretty-printed and copyable. A body received as
// text (plain text, XML) is shown as it came, apart, with its own copy
// button. A payload too large to keep shows its stored preview, as text,
// with the size it had.

const props = defineProps<{
	raw: string | undefined
	kept: boolean
}>()

const { locale } = useI18n()

const parsed = computed(() => parsePayload(props.raw ?? 'null'))

/** What the backend keeps of a payload too large: its size and a preview. */
const preview = computed(() => {
	if (props.kept) return null
	const marker = parsed.value as { originalBytes?: unknown; preview?: unknown } | null
	return {
		text: typeof marker?.preview === 'string' ? marker.preview : '',
		bytes: typeof marker?.originalBytes === 'number' ? marker.originalBytes : null,
	}
})

/** A webhook body that is text, not JSON: shown as received. */
const textBody = computed(() => {
	if (!props.kept) return null
	const envelope = parsed.value as { body?: unknown; headers?: Record<string, unknown> } | null
	if (typeof envelope?.body !== 'string') return null
	const type = envelope.headers?.['content-type']
	return { text: envelope.body, type: typeof type === 'string' ? type : null }
})

const text = computed(() => {
	if (!textBody.value) return prettyJson(parsed.value)
	// The body is shown on its own; the rest of the envelope stays JSON.
	const { body: _body, ...rest } = parsed.value as Record<string, unknown>
	return prettyJson(rest)
})

const bytes = computed(() => preview.value?.bytes ?? new Blob([props.raw ?? '']).size)

function describeBytes(value: number): string {
	return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value / 1024)} kB`
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<template v-if="preview">
			<DmsBanner
				size="sm"
				tone="warning"
				icon="i-ph-warning"
				:title="$t('dms_automation.trace.payloadTooLarge')"
				:description="$t('dms_automation.trace.payloadTooLargeHint')"
			/>
			<div class="flex items-center justify-between gap-2 font-mono text-[10.5px] text-dimmed">
				<span>{{ $t('dms_automation.trace.payloadPreview', { chars: preview.text.length, size: describeBytes(bytes) }) }}</span>
				<DmsCopyButton :value="preview.text" />
			</div>
			<pre class="max-h-[28rem] overflow-auto rounded-md border border-default bg-elevated p-3 font-mono text-xs break-all whitespace-pre-wrap text-toned">{{ preview.text }}</pre>
		</template>
		<template v-else>
			<div class="relative">
				<pre class="max-h-[28rem] overflow-auto rounded-md border border-default bg-elevated p-3 font-mono text-xs text-toned">{{ text }}</pre>
				<div class="absolute top-2 right-2 flex items-center gap-2">
					<span class="font-mono text-[10.5px] text-dimmed">{{ describeBytes(bytes) }}</span>
					<DmsCopyButton :value="textBody ? text : (raw ?? '')" />
				</div>
			</div>
			<template v-if="textBody">
				<div class="flex items-center justify-between gap-2 font-mono text-[10.5px] text-dimmed uppercase">
					<span>{{ $t('dms_automation.trace.payloadBody') }}<template v-if="textBody.type"> · <span class="normal-case">{{ textBody.type }}</span></template></span>
					<DmsCopyButton :value="textBody.text" />
				</div>
				<pre class="max-h-[28rem] overflow-auto rounded-md border border-default bg-elevated p-3 font-mono text-xs break-words whitespace-pre-wrap text-toned">{{ textBody.text }}</pre>
			</template>
		</template>
	</div>
</template>
