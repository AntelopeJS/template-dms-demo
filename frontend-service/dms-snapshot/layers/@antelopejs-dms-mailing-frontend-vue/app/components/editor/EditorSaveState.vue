<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'

type SaveView = 'saving' | 'saved' | 'unpublished' | 'error' | 'conflict'

const DOT_CLASSES: Record<SaveView, string> = {
	saving: 'bg-dimmed animate-pulse',
	saved: 'bg-success',
	unpublished: 'bg-warning',
	error: 'bg-error',
	conflict: 'bg-error',
}
const KEY = 'dms_mailing.editor.save_state'
const LABEL_KEYS: Record<SaveView, string> = {
	saving: `${KEY}.saving`,
	saved: `${KEY}.saved`,
	unpublished: `${KEY}.unpublished`,
	error: `${KEY}.error`,
	conflict: 'dms_mailing.editor.conflict.title',
}
const FAILED_VIEWS: SaveView[] = ['error', 'conflict']

const { t } = useI18n()
const { editor, session } = useEditorContext()

const view = computed<SaveView>(() => {
	const { saveStatus } = session.state
	if (saveStatus === 'error' || saveStatus === 'conflict') return saveStatus
	if (session.isSaving) return 'saving'
	return session.state.changes.length > 0 ? 'unpublished' : 'saved'
})

const isFailed = computed(() => FAILED_VIEWS.includes(view.value))

const label = computed(() => {
	const count = session.state.changes.length
	return t(LABEL_KEYS[view.value], { count }, count)
})

const hint = computed(() => {
	if (view.value === 'conflict') return t('dms_mailing.errors.draft_conflict')
	return view.value === 'error' ? t(`${KEY}.retry`) : t(`${KEY}.hint`)
})
</script>

<template>
	<div class="flex items-center gap-1">
		<button
			type="button"
			class="text-muted flex items-center gap-1.5 rounded px-1.5 font-mono text-[11.5px]"
			:class="{
				'text-error': isFailed,
				'hover:underline': view === 'error',
				'cursor-default': view !== 'error',
			}"
			:title="hint"
			@click="view === 'error' && session.save()"
		>
			<span class="size-1.5 rounded-full" :class="DOT_CLASSES[view]" />
			{{ label }}
		</button>
		<UTooltip :text="t(`${KEY}.undo`)" :kbds="['meta', 'z']">
			<UButton
				icon="i-ph-arrow-counter-clockwise"
				size="sm"
				color="neutral"
				variant="ghost"
				square
				:disabled="!editor.canUndo"
				:aria-label="t(`${KEY}.undo`)"
				@click="editor.undo()"
			/>
		</UTooltip>
		<UTooltip :text="t(`${KEY}.redo`)" :kbds="['shift', 'meta', 'z']">
			<UButton
				icon="i-ph-arrow-clockwise"
				size="sm"
				color="neutral"
				variant="ghost"
				square
				:disabled="!editor.canRedo"
				:aria-label="t(`${KEY}.redo`)"
				@click="editor.redo()"
			/>
		</UTooltip>
	</div>
</template>
