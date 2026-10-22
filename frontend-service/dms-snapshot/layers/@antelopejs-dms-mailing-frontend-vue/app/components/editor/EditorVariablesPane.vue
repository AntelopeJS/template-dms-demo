<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VariableDefinition } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import {
	countPathUsages,
	inferVariableType,
	mergeVariables,
} from '../../utils/variables'
import type { MergedVariable, VariableSubmission } from '../../utils/variables'
import {
	systemVariableChecks,
	systemVariables,
} from '../../utils/system-variables'

interface VariableDraft {
	original: string | null
	/** The path the content uses, when the draft starts from a used one. */
	usedPath: string | null
	value: VariableDefinition
}

const KEY = 'dms_mailing.editor.variables'

const { t } = useI18n()
const { confirm } = useConfirm()
const { editor, session } = useEditorContext()

const merged = computed(() =>
	mergeVariables(session.detected, editor.variables),
)
const systemVars = computed(() =>
	systemVariables(editor.content, session.state.template.category),
)
const systemChecks = computed(() =>
	systemVariableChecks(
		editor.content,
		session.state.template.category,
		session.testData ?? {},
	),
)
const draft = ref<VariableDraft | null>(null)

const usageCount = computed(() =>
	draft.value?.usedPath
		? countPathUsages(editor.content, draft.value.usedPath)
		: 0,
)

function startNew(path = ''): void {
	draft.value = {
		original: null,
		usedPath: path || null,
		value: {
			path,
			type: inferVariableType(editor.content, path),
			required: false,
		},
	}
}

function edit(variable: MergedVariable): void {
	if (variable.usage === 'detected') return startNew(variable.path)
	draft.value = {
		original: variable.path,
		usedPath: variable.usage === 'unused' ? null : variable.path,
		value: {
			path: variable.path,
			type: variable.type,
			required: variable.required,
		},
	}
}

/**
 * Declarations are part of the draft: the change autosaves with the content,
 * undoes with it and reaches callers only once published.
 */
function save({ value, shouldReplaceInContent }: VariableSubmission): void {
	const original = draft.value?.original
	const usedPath = draft.value?.usedPath
	const kept = editor.variables.filter(
		(variable) => variable.path !== original && variable.path !== value.path,
	)
	const rename =
		shouldReplaceInContent && usedPath
			? { from: usedPath, to: value.path }
			: undefined
	editor.setVariables([...kept, value], rename)
	draft.value = null
}

function isRemovalConfirmed(variable: MergedVariable): Promise<boolean> {
	const count = countPathUsages(editor.content, variable.path)
	if (count === 0) return Promise.resolve(true)
	return confirm({
		title: t(`${KEY}.remove_used_title`, { path: variable.path }),
		description: t(`${KEY}.remove_used_description`, { count }, count),
		color: 'error',
	})
}

async function remove(variable: MergedVariable): Promise<void> {
	if (!(await isRemovalConfirmed(variable))) return
	editor.setVariables(
		editor.variables.filter((entry) => entry.path !== variable.path),
	)
}

function insert(path: string): void {
	session.state.activeField?.insert(path)
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<DmsEyebrow :label="t(`${KEY}.insert_hint`)" />
		<p class="text-muted text-xs">{{ t(`${KEY}.draft_hint`) }}</p>

		<p v-if="merged.length === 0" class="text-muted text-xs">
			{{ t(`${KEY}.empty`) }}
		</p>

		<MailingEditorVariableRow
			v-for="variable in merged"
			:key="variable.path"
			:variable="variable"
			@insert="insert(variable.path)"
			@edit="edit(variable)"
			@remove="remove(variable)"
		/>

		<MailingEditorVariableForm
			v-if="draft"
			:value="draft.value"
			:is-new="draft.original === null"
			:used-path="draft.usedPath"
			:usage-count="usageCount"
			@save="save"
			@cancel="draft = null"
		/>
		<UButton
			v-else
			size="sm"
			color="neutral"
			variant="outline"
			icon="i-ph-plus"
			block
			class="mt-1"
			@click="startNew()"
		>
			{{ t(`${KEY}.declare`) }}
		</UButton>

		<MailingSystemVariables
			class="mt-3"
			:variables="systemVars"
			:checks="systemChecks"
		/>
	</div>
</template>
