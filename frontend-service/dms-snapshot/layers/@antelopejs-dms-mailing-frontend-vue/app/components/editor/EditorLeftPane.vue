<script setup lang="ts">
import { computed } from 'vue'
import type { LeftTab } from '../../composables/useTemplateEditor'
import { useEditorContext } from '../../composables/useEditorContext'

interface ShortcutEntry {
	keys: string[]
	label: string
}

const KEY = 'dms_mailing.editor.left'

const SHORTCUTS: ShortcutEntry[] = [
	{ keys: ['meta', 's'], label: 'shortcut_save' },
	{ keys: ['meta', 'enter'], label: 'shortcut_publish' },
	{ keys: ['T'], label: 'shortcut_test' },
	{ keys: ['/'], label: 'shortcut_search' },
	{ keys: ['backspace'], label: 'shortcut_delete' },
	{ keys: ['meta', 'D'], label: 'shortcut_duplicate' },
	{ keys: ['meta', 'Z'], label: 'shortcut_undo' },
	{ keys: ['meta', 'shift', 'Z'], label: 'shortcut_redo' },
	{ keys: ['escape'], label: 'shortcut_escape' },
]

const { t } = useI18n()
const { editor, session } = useEditorContext()

const variableCount = computed(
	() =>
		new Set([
			...editor.variables.map((variable) => variable.path),
			...session.detected,
		]).size,
)

const items = computed(() => [
	{ value: 'blocks', label: t(`${KEY}.blocks`) },
	{ value: 'outline', label: t(`${KEY}.outline`) },
	{
		value: 'variables',
		label: t(`${KEY}.variables`),
		badge: {
			label: String(variableCount.value),
			color: 'neutral' as const,
			variant: 'subtle' as const,
		},
	},
])

const tab = computed({
	get: () => editor.leftTab,
	set: (value: string | number) => (editor.leftTab = value as LeftTab),
})
</script>

<template>
	<aside class="border-default bg-elevated/30 flex min-h-0 flex-col border-r">
		<UTabs
			v-model="tab"
			:items="items"
			:content="false"
			variant="link"
			size="sm"
			class="border-default shrink-0 border-b px-2"
		/>
		<div class="min-h-0 flex-1 overflow-y-auto p-3.5">
			<MailingEditorPalette v-if="editor.leftTab === 'blocks'" />
			<MailingEditorOutline v-else-if="editor.leftTab === 'outline'" />
			<MailingEditorVariablesPane v-else />
		</div>
		<footer class="border-default shrink-0 border-t px-2 py-1.5">
			<UPopover :content="{ side: 'top', align: 'start' }">
				<UButton
					icon="i-ph-keyboard"
					size="xs"
					color="neutral"
					variant="ghost"
					block
					class="justify-start"
				>
					{{ t(`${KEY}.shortcuts`) }}
				</UButton>
				<template #content>
					<ul
						class="flex flex-col gap-1.5 p-3 text-xs"
						:aria-label="t(`${KEY}.shortcuts`)"
					>
						<li
							v-for="shortcut in SHORTCUTS"
							:key="shortcut.label"
							class="flex items-center justify-between gap-6"
						>
							<span class="text-muted">
								{{ t(`${KEY}.${shortcut.label}`) }}
							</span>
							<MailingEditorShortcutHint :keys="shortcut.keys" />
						</li>
					</ul>
				</template>
			</UPopover>
		</footer>
	</aside>
</template>
