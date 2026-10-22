<script setup lang="ts">
import type { MergedVariable } from '../../utils/variables'
import { variableTypeLabelKey } from '../../utils/variable-types'
import VariablePath from '../VariablePath.vue'

interface Props {
	variable: MergedVariable
}

defineProps<Props>()
const emit = defineEmits<{ insert: []; edit: []; remove: [] }>()

const KEY = 'dms_mailing.editor.variables'

const { t } = useI18n()
</script>

<template>
	<div
		class="border-default bg-default hover:border-primary/50 group flex flex-col gap-1 rounded-md border px-2 py-1.5 transition-colors"
		:class="{ 'border-warning/50 bg-warning/5': variable.usage === 'detected' }"
	>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="flex min-w-0 flex-1 items-center gap-1 text-left"
				:title="`${t(`${KEY}.insert`)} · ${variable.path}`"
				@click="emit('insert')"
			>
				<VariablePath
					:path="variable.path"
					class="text-[11.5px]"
					:class="
						variable.usage === 'unused'
							? 'text-dimmed line-through'
							: 'text-highlighted'
					"
				/>
				<span v-if="variable.required" class="text-warning text-xs">*</span>
			</button>
			<span
				v-if="variable.usage === 'declared'"
				class="text-dimmed shrink-0 text-[10.5px]"
			>
				{{ t(variableTypeLabelKey(variable.type)) }}
			</span>
			<template v-if="variable.usage !== 'detected'">
				<UButton
					icon="i-ph-pencil-simple"
					size="xs"
					color="neutral"
					variant="ghost"
					square
					class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
					:aria-label="t(`${KEY}.edit`)"
					@click="emit('edit')"
				/>
				<UButton
					icon="i-ph-trash"
					size="xs"
					color="error"
					variant="ghost"
					square
					class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
					:aria-label="t(`${KEY}.remove`)"
					@click="emit('remove')"
				/>
			</template>
		</div>
		<div
			v-if="variable.usage === 'detected'"
			class="flex items-center justify-between gap-2"
		>
			<DmsStatusPill tone="warning" size="sm" :label="t(`${KEY}.undeclared`)" />
			<UButton size="xs" variant="soft" color="warning" @click="emit('edit')">
				{{ t(`${KEY}.declare_one`) }}
			</UButton>
		</div>
		<DmsStatusPill
			v-else-if="variable.usage === 'unused'"
			tone="neutral"
			size="sm"
			class="self-start"
			:label="t(`${KEY}.unused`)"
		/>
	</div>
</template>
