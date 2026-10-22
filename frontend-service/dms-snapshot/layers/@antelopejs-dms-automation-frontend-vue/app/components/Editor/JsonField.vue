<script setup lang="ts">
import { ref, watch } from 'vue'

// Textarea for any-typed config values. Keeps local string state so the user
// can type freely (e.g. a partial JSON literal) without the parent re-render
// clobbering it. Only commits the parsed value upward on blur. If the text
// fails to JSON.parse on blur, the raw string is committed as-is.

const props = defineProps<{
	modelValue: unknown
}>()

const emit = defineEmits<{
	(e: 'update:model-value', v: unknown): void
}>()

function serialize(v: unknown): string {
	if (v === undefined) return ''
	if (typeof v === 'string') return v
	try {
		return JSON.stringify(v, null, 2)
	} catch {
		return ''
	}
}

function parse(s: string): unknown {
	if (s.trim() === '') return undefined
	try {
		return JSON.parse(s)
	} catch {
		return s
	}
}

const text = ref<string>(serialize(props.modelValue))

watch(
	() => props.modelValue,
	(v) => {
		// Only sync from outside if the parsed text doesn't already match —
		// avoids overwriting the user's in-progress text on unrelated parent
		// re-renders.
		const parsed = parse(text.value)
		if (JSON.stringify(parsed) === JSON.stringify(v)) return
		text.value = serialize(v)
	},
)

function onBlur() {
	emit('update:model-value', parse(text.value))
}
</script>

<template>
	<DmsTextarea
		v-model="text"
		:rows="4"
		:placeholder="$t('dms_automation.editor.inspector.jsonPlaceholder')"
		class="w-full font-mono"
		@blur="onBlur"
	/>
</template>
