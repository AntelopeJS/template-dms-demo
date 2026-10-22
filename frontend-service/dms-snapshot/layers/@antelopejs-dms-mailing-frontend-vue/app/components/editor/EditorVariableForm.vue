<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VariableDefinition } from '../../types/mailing'
import { variableTypeItems } from '../../utils/variable-types'
import { isValidVariablePath, suggestVariablePath } from '../../utils/variables'
import type { VariableSubmission } from '../../utils/variables'

interface Props {
	value: VariableDefinition
	isNew: boolean
	/** The path the content uses now, which a new path may replace. */
	usedPath?: string | null
	/** How many places of the content use `usedPath`. */
	usageCount?: number
}

const props = withDefaults(defineProps<Props>(), {
	usedPath: null,
	usageCount: 0,
})
const emit = defineEmits<{ save: [VariableSubmission]; cancel: [] }>()

const KEY = 'dms_mailing.editor.variables'

const { t } = useI18n()

const typeItems = computed(() => variableTypeItems((key) => t(key)))

const draft = ref<VariableDefinition>({ ...props.value })
const shouldReplace = ref(true)

const path = computed(() => draft.value.path.trim())
const isPathValid = computed(() => isValidVariablePath(path.value))
const pathError = computed(() =>
	path.value && !isPathValid.value
		? t(`${KEY}.invalid_path`, {
				suggestion: suggestVariablePath(path.value),
			})
		: undefined,
)
const canReplace = computed(
	() =>
		isPathValid.value &&
		props.usageCount > 0 &&
		Boolean(props.usedPath) &&
		path.value !== props.usedPath,
)

function submit(): void {
	if (!isPathValid.value) return
	emit('save', {
		value: { ...draft.value, path: path.value },
		shouldReplaceInContent: canReplace.value && shouldReplace.value,
	})
}
</script>

<template>
	<form
		class="border-default bg-default mt-1 flex flex-col gap-2.5 rounded-md border p-2.5"
		@submit.prevent="submit()"
	>
		<UFormField :label="t(`${KEY}.path`)" :error="pathError" size="xs">
			<UInput
				v-model="draft.path"
				class="w-full font-mono"
				placeholder="order.total"
				autofocus
			/>
		</UFormField>
		<UCheckbox
			v-if="canReplace"
			v-model="shouldReplace"
			size="sm"
			:label="t(`${KEY}.rename_in_blocks`, { count: usageCount }, usageCount)"
		/>
		<UFormField :label="t(`${KEY}.type`)" size="xs">
			<USelect
				v-model="draft.type"
				class="w-full"
				:items="typeItems"
				value-key="value"
			/>
		</UFormField>
		<USwitch v-model="draft.required" size="sm" :label="t(`${KEY}.required`)" />
		<div class="flex items-center gap-2">
			<UButton type="submit" size="xs" :disabled="!isPathValid">
				{{ isNew ? t(`${KEY}.add`) : t(`${KEY}.save`) }}
			</UButton>
			<UButton
				size="xs"
				color="neutral"
				variant="ghost"
				@click="emit('cancel')"
			>
				{{ t(`${KEY}.cancel`) }}
			</UButton>
		</div>
	</form>
</template>
