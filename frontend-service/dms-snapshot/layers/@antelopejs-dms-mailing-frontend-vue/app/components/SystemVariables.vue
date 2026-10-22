<script setup lang="ts">
import type { EditorCheck } from '../utils/editor-checks'
import type { SystemVariable } from '../utils/system-variables'
import { variableTypeLabelKey } from '../utils/variable-types'
import VariablePath from './VariablePath.vue'

interface Props {
	variables: SystemVariable[]
	/** What the footer links still lack (a marketing e-mail without one). */
	checks?: EditorCheck[]
}

withDefaults(defineProps<Props>(), { checks: () => [] })

const KEY = 'dms_mailing.system_variables'

const { t } = useI18n()
</script>

<template>
	<div
		v-if="variables.length || checks.length"
		class="flex min-w-0 flex-col gap-1"
	>
		<DmsEyebrow :label="t(`${KEY}.title`)" />
		<p class="text-muted text-[12px] [overflow-wrap:anywhere]">
			{{ t(`${KEY}.description`) }}
		</p>
		<div
			v-for="variable in variables"
			:key="variable.path"
			class="border-default flex flex-col items-start gap-1 border-b py-1.5 last:border-b-0"
		>
			<div class="flex w-full min-w-0 items-center gap-2">
				<VariablePath :path="variable.path" class="text-toned text-[12px]" />
				<span
					v-if="variable.required"
					class="text-error"
					:title="t(`${KEY}.required`)"
				>
					*
				</span>
				<span class="text-dimmed ml-auto shrink-0 text-[11px]">
					{{ t(variableTypeLabelKey(variable.type)) }}
				</span>
			</div>
			<DmsStatusPill
				tone="neutral"
				size="sm"
				dot="none"
				:label="t(`${KEY}.at_send`)"
			/>
		</div>
		<p
			v-for="check in checks"
			:key="check.id"
			class="text-warning flex items-start gap-1.5 text-[12px] [overflow-wrap:anywhere]"
		>
			<UIcon name="i-ph-warning" class="mt-0.5 size-3.5 shrink-0" />
			{{ t(check.key, check.params) }}
		</p>
	</div>
</template>
