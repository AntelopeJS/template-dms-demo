<script setup lang="ts">
import { computed, inject } from 'vue'
import { TOKEN_DATA_KEY, resolveToken, splitTokens } from '../utils/tokens'

type TokenVariant = 'paper' | 'ui'

interface Props {
	text?: string
	/** `paper` keeps the fixed cyan of the white e-mail sheet in both themes. */
	variant?: TokenVariant
}

interface RenderedPart {
	key: number
	kind: 'text' | 'token' | 'value' | 'missing' | 'invalid'
	value: string
}

const props = withDefaults(defineProps<Props>(), {
	text: '',
	variant: 'paper',
})

const CHIP_CLASSES: Record<TokenVariant, string> = {
	paper: 'bg-cyan-50 text-cyan-800 ring-1 ring-inset ring-cyan-200',
	ui: 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25',
}
const CHIP_BASE =
	'rounded px-1 py-px font-mono text-[.86em] font-medium whitespace-nowrap'
const VALUE_CLASS = 'rounded-sm bg-yellow-400/20 px-0.5'
const MISSING_CLASS =
	'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300'
/** A `{{�}}` the engine does not read: it reaches the recipient as typed. */
const INVALID_CLASS =
	'underline decoration-red-500 decoration-wavy underline-offset-2'

const TOKEN_OPEN = '{{'
const TOKEN_CLOSE = '}}'

const data = inject(TOKEN_DATA_KEY, null)

const parts = computed<RenderedPart[]>(() =>
	splitTokens(props.text ?? '').map((part, key) => {
		if (part.kind !== 'token')
			return { key, kind: part.kind, value: part.value }
		const token = `${TOKEN_OPEN}${part.value}${TOKEN_CLOSE}`
		if (!data?.value) return { key, kind: 'token', value: token }
		const resolved = resolveToken(part.value, data.value)
		return resolved.isPresent
			? { key, kind: 'value', value: resolved.text }
			: { key, kind: 'missing', value: token }
	}),
)

const chipClass = computed(() => `${CHIP_BASE} ${CHIP_CLASSES[props.variant]}`)
const missingClass = `${CHIP_BASE} ${MISSING_CLASS}`
</script>

<template>
	<span class="whitespace-pre-line [overflow-wrap:anywhere]">
		<template v-for="part in parts" :key="part.key">
			<span v-if="part.kind === 'token'" :class="chipClass">
				{{ part.value }}
			</span>
			<span v-else-if="part.kind === 'value'" :class="VALUE_CLASS">
				{{ part.value }}
			</span>
			<span v-else-if="part.kind === 'missing'" :class="missingClass">
				{{ part.value }}
			</span>
			<span v-else-if="part.kind === 'invalid'" :class="INVALID_CLASS">
				{{ part.value }}
			</span>
			<template v-else>{{ part.value }}</template>
		</template>
	</span>
</template>
