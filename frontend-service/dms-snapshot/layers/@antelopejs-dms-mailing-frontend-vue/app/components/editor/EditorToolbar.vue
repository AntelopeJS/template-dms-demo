<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { isPublishable } from '../../utils/lifecycle'

const { t } = useI18n()
const { editor, session, actions } = useEditorContext()

const canPublishNow = computed(() =>
	isPublishable({
		status: session.state.template.status,
		changeCount: session.state.changes.length,
		dirty: editor.dirty,
	}),
)
</script>

<template>
	<header
		class="border-default bg-default flex h-14 shrink-0 items-center gap-2.5 border-b px-3"
	>
		<MailingEditorTitle />
		<span class="border-default h-5 border-l" />
		<MailingEditorLocaleSwitch />
		<MailingEditorViewSwitches />

		<div class="ml-auto flex items-center gap-2">
			<MailingEditorSaveState />
			<span class="border-default h-5 border-l" />
			<UTooltip :text="t('dms_mailing.editor.toolbar.test_hint')" :kbds="['T']">
				<UButton
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-ph-flask"
					@click="actions.test()"
				>
					{{ t('dms_mailing.editor.toolbar.test') }}
				</UButton>
			</UTooltip>
			<UButton
				size="sm"
				icon="i-ph-rocket-launch"
				:disabled="!canPublishNow"
				@click="actions.publish()"
			>
				{{ t('dms_mailing.editor.toolbar.publish') }}
				<span class="flex items-center gap-0.5 opacity-80">
					<UKbd value="meta" size="sm" color="primary" variant="solid" />
					<UKbd value="enter" size="sm" color="primary" variant="solid" />
				</span>
			</UButton>
		</div>
	</header>
</template>
