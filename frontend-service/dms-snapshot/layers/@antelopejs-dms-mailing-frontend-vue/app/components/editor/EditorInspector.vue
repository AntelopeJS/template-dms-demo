<script setup lang="ts">
import { computed } from 'vue'
import type { RightTab } from '../../composables/useTemplateEditor'
import { useEditorContext } from '../../composables/useEditorContext'
import { openIssueCount, testDataChecks } from '../../utils/editor-checks'

const KEY = 'dms_mailing.editor.inspector'

const { t } = useI18n()
const { editor, session } = useEditorContext()

const checks = computed(() =>
	testDataChecks({
		variables: editor.variables,
		detected: session.detected,
		data: session.testData ?? {},
		blocks: editor.current?.blocks ?? [],
	}),
)
const issues = computed(() =>
	session.testData ? openIssueCount(checks.value) : 1,
)

const items = computed(() => [
	{ value: 'block', label: t(`${KEY}.block`) },
	{
		value: 'data',
		label: t(`${KEY}.data`),
		...(issues.value > 0
			? {
					badge: {
						label: String(issues.value),
						color: 'warning' as const,
						variant: 'subtle' as const,
					},
				}
			: {}),
	},
	{ value: 'template', label: t(`${KEY}.template`) },
])

const tab = computed({
	get: () => editor.rightTab,
	set: (value: string | number) => (editor.rightTab = value as RightTab),
})
</script>

<template>
	<aside class="border-default bg-elevated/30 flex min-h-0 flex-col border-l">
		<UTabs
			v-model="tab"
			:items="items"
			:content="false"
			variant="link"
			size="sm"
			class="border-default shrink-0 border-b px-2"
		/>
		<div class="min-h-0 flex-1 overflow-y-auto p-4">
			<template v-if="editor.rightTab === 'block'">
				<MailingEditorBlockInspector
					v-if="editor.selected"
					:key="editor.selected.id"
					:block="editor.selected"
				/>
				<DmsEmptyState
					v-else
					size="sm"
					icon="i-ph-cursor-click"
					:title="t(`${KEY}.empty_title`)"
					:description="t(`${KEY}.empty_description`)"
				/>
			</template>
			<MailingEditorTestDataPane
				v-else-if="editor.rightTab === 'data'"
				:checks="checks"
			/>
			<MailingEditorTemplatePane v-else />
		</div>
	</aside>
</template>
