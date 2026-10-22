<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import type { EditorCheck } from '../../utils/editor-checks'

interface Props {
	checks: EditorCheck[]
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.test_data'
const MIN_LINES = 10
const MAX_LINES = 18

const { t } = useI18n()
const toast = useToast()
const { session } = useEditorContext()

const saving = ref(false)

const isValid = computed(() => session.testData !== null)

const hint = computed(() => {
	if (!isValid.value) return t(`${KEY}.invalid`)
	return session.isTestDataDirty
		? t(`${KEY}.valid_unsaved`)
		: t(`${KEY}.valid_saved`)
})

const items = computed(() =>
	isValid.value
		? props.checks.map((entry) => ({
				id: entry.id,
				label: t(entry.key, entry.params),
				state: entry.state,
			}))
		: [{ id: 'invalid', label: t(`${KEY}.fix_json`), state: 'warn' as const }],
)

async function save(): Promise<void> {
	saving.value = true
	try {
		if (await session.saveTestData())
			toast.add({ color: 'success', title: t(`${KEY}.saved`) })
	} catch (error) {
		session.reportError(error)
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<UFormField :label="t(`${KEY}.label`)" size="sm">
			<template #hint>
				<span class="text-dimmed font-mono text-[11px]">JSON</span>
			</template>
			<DmsInputCode
				v-model="session.state.testDataSource"
				language="json"
				:min-lines="MIN_LINES"
				:max-lines="MAX_LINES"
				:line-numbers="false"
			/>
			<template #help>
				<span :class="isValid ? 'text-success' : 'text-error'">{{ hint }}</span>
			</template>
		</UFormField>

		<div class="flex items-center gap-1.5">
			<UButton
				size="sm"
				icon="i-ph-floppy-disk"
				:loading="saving"
				:disabled="!isValid || !session.isTestDataDirty"
				@click="save()"
			>
				{{ t(`${KEY}.save`) }}
			</UButton>
			<UButton
				size="sm"
				color="neutral"
				variant="ghost"
				:disabled="!session.isTestDataDirty"
				@click="session.resetTestData()"
			>
				{{ t(`${KEY}.reset`) }}
			</UButton>
		</div>

		<USeparator />
		<DmsEyebrow :label="t(`${KEY}.checks`)" />
		<DmsCheckList :items="items" size="sm" />
		<MailingEditorMissingPolicy />
	</div>
</template>
