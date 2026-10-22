<script setup lang="ts">
import {
	computed,
	markRaw,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
} from 'vue'
import type { TokenFieldHandle } from '../../composables/useEditorContext'
import { useEditorContext } from '../../composables/useEditorContext'
import {
	insertSuggestion,
	insertTokenAt,
	suggestPaths,
	tokenQueryAt,
} from '../../utils/autocomplete'
import type {
	PathSuggestion,
	TextEdit,
	TokenQuery,
} from '../../utils/autocomplete'
import { SYSTEM_PATHS } from '../../utils/paths'
import { splitRawSegments } from '../../utils/tokens'

interface Props {
	modelValue: string
	isMultiline?: boolean
	placeholder?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const SINGLE_LINE_ROWS = 1
const MULTI_LINE_ROWS = 3
const LINE_BREAKS = /[\r\n]+/g
const CARET_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
const FIELD_CLASS =
	'whitespace-pre-wrap break-words px-2.5 py-1.5 font-sans text-sm leading-6'

const INVALID_CLASS = 'bg-error/15 text-error underline decoration-wavy'

const { editor, session } = useEditorContext()
const { t } = useI18n()

const textarea = ref<HTMLTextAreaElement | null>(null)
const query = ref<TokenQuery | null>(null)
const highlighted = ref(0)

const declared = computed(
	() =>
		new Set([
			...editor.variables.map((variable) => variable.path),
			...SYSTEM_PATHS,
		]),
)
const segments = computed(() => splitRawSegments(props.modelValue))
const hasInvalidToken = computed(() =>
	segments.value.some((segment) => segment.kind === 'invalid'),
)
const suggestions = computed<PathSuggestion[]>(() =>
	query.value
		? suggestPaths(query.value.query, {
				variables: editor.variables,
				detected: session.detected,
				system: SYSTEM_PATHS,
			})
		: [],
)
const isOpen = computed(() => suggestions.value.length > 0)

function caret(): number {
	return textarea.value?.selectionStart ?? props.modelValue.length
}

function refreshQuery(): void {
	query.value = textarea.value
		? tokenQueryAt(textarea.value.value, caret())
		: null
	highlighted.value = 0
}

function autosize(): void {
	const element = textarea.value
	if (!element) return
	element.style.height = 'auto'
	element.style.height = `${element.scrollHeight}px`
}

function clean(value: string): string {
	return props.isMultiline ? value : value.replace(LINE_BREAKS, ' ')
}

function onInput(event: Event): void {
	emit('update:modelValue', clean((event.target as HTMLTextAreaElement).value))
	void nextTick(refreshQuery)
}

async function apply(edit: TextEdit): Promise<void> {
	emit('update:modelValue', edit.text)
	await nextTick()
	textarea.value?.focus()
	textarea.value?.setSelectionRange(edit.caret, edit.caret)
	refreshQuery()
}

function choose(suggestion: PathSuggestion): void {
	if (!query.value) return
	void apply(
		insertSuggestion(props.modelValue, query.value, caret(), suggestion.path),
	)
	query.value = null
}

const handle: TokenFieldHandle = markRaw({
	insert: (path: string) =>
		void apply(insertTokenAt(props.modelValue, caret(), path)),
})

function moveHighlight(step: number): void {
	const count = suggestions.value.length
	highlighted.value = (highlighted.value + step + count) % count
}

const MENU_KEYS: Record<string, () => void> = {
	ArrowDown: () => moveHighlight(1),
	ArrowUp: () => moveHighlight(-1),
	Enter: () => choose(suggestions.value[highlighted.value] as PathSuggestion),
	Tab: () => choose(suggestions.value[highlighted.value] as PathSuggestion),
	Escape: () => (query.value = null),
}

function onKeydown(event: KeyboardEvent): void {
	const action = isOpen.value ? MENU_KEYS[event.key] : undefined
	if (action) {
		event.preventDefault()
		event.stopPropagation()
		action()
		return
	}
	if (!props.isMultiline && event.key === 'Enter') event.preventDefault()
}

function onKeyup(event: KeyboardEvent): void {
	if (CARET_KEYS.includes(event.key)) refreshQuery()
}

function onFocus(): void {
	session.state.activeField = handle
}

watch(
	() => props.modelValue,
	() => void nextTick(autosize),
)
onMounted(autosize)
onBeforeUnmount(() => {
	if (session.state.activeField === handle) session.state.activeField = null
})
</script>

<template>
	<div class="relative w-full">
		<div
			class="border-default bg-default focus-within:border-primary focus-within:ring-primary relative rounded-md border transition-colors focus-within:ring-1"
		>
			<div
				aria-hidden="true"
				class="text-highlighted pointer-events-none absolute inset-0 overflow-hidden"
				:class="FIELD_CLASS"
			>
				<template v-for="(segment, index) in segments" :key="index">
					<span
						v-if="segment.kind === 'token'"
						class="rounded-sm box-decoration-clone"
						:class="
							declared.has(segment.value)
								? 'bg-primary/15 text-primary'
								: 'bg-warning/15 text-warning'
						"
					>
						{{ segment.raw }}
					</span>
					<span
						v-else-if="segment.kind === 'invalid'"
						class="rounded-sm box-decoration-clone"
						:class="INVALID_CLASS"
					>
						{{ segment.raw }}
					</span>
					<template v-else>{{ segment.raw }}</template>
				</template>
				<span>&#8203;</span>
			</div>
			<textarea
				ref="textarea"
				:value="modelValue"
				:rows="isMultiline ? MULTI_LINE_ROWS : SINGLE_LINE_ROWS"
				:placeholder="placeholder"
				class="placeholder:text-dimmed caret-(--ui-text-highlighted) relative block w-full resize-none overflow-hidden bg-transparent text-transparent outline-none"
				:class="FIELD_CLASS"
				spellcheck="true"
				@input="onInput"
				@keydown="onKeydown"
				@keyup="onKeyup"
				@click="refreshQuery()"
				@focus="onFocus()"
				@blur="query = null"
			/>
		</div>
		<p v-if="hasInvalidToken" class="text-error mt-1 text-xs">
			{{ t('dms_mailing.editor.token_invalid') }}
		</p>
		<MailingEditorAutocompleteMenu
			v-if="isOpen"
			:items="suggestions"
			:highlighted="highlighted"
			@choose="choose"
			@hover="highlighted = $event"
		/>
	</div>
</template>
