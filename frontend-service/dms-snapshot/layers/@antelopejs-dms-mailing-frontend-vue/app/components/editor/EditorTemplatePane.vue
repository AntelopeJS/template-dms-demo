<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TemplateDetails } from '../../composables/useMailingApi'
import { useEditorContext } from '../../composables/useEditorContext'
import { useLocalizedDefaults } from '../../composables/useLocalizedDefaults'

const KEY = 'dms_mailing.editor.template_tab'
const NO_CATEGORY = '__none__'

const { t } = useI18n()
const toast = useToast()
const { editor, session, actions, templateId } = useEditorContext()
const localized = useLocalizedDefaults()

const template = computed(() => session.state.template)
const name = ref(template.value.name)

watch(
	() => template.value.name,
	(value) => (name.value = value),
)

const categoryItems = computed(() => [
	{ value: NO_CATEGORY, label: t(`${KEY}.no_category`), icon: 'i-ph-minus' },
	...localized.categories(session.state.categories).map((category) => ({
		value: category.id,
		label: category.label,
		icon: category.icon,
	})),
])

async function persist(patch: Partial<TemplateDetails>): Promise<void> {
	try {
		await session.saveDetails(patch)
		toast.add({ color: 'success', title: t(`${KEY}.saved`) })
	} catch (error) {
		session.reportError(error)
	}
}

function saveName(): void {
	const trimmed = name.value.trim()
	if (!trimmed || trimmed === template.value.name) {
		name.value = template.value.name
		return
	}
	void persist({ name: trimmed })
}

const category = computed({
	get: () => template.value.category || NO_CATEGORY,
	set: (value: string) =>
		void persist({ category: value === NO_CATEGORY ? null : value }),
})

const subject = computed({
	get: () => editor.current?.subject ?? '',
	set: (value: string) => editor.updateLocale({ subject: value }),
})

const subjectHelp = computed(() =>
	t(
		session.state.blockOnMissingVariables
			? `${KEY}.subject_help_block`
			: `${KEY}.subject_help_send`,
	),
)

const preheader = computed({
	get: () => editor.current?.preheader ?? '',
	set: (value: string) => editor.updateLocale({ preheader: value }),
})
</script>

<template>
	<div class="flex flex-col gap-4">
		<UFormField :label="t(`${KEY}.name`)" size="sm">
			<UInput
				v-model="name"
				class="w-full"
				@blur="saveName()"
				@keydown.enter.prevent="saveName()"
			/>
		</UFormField>
		<UFormField :label="t(`${KEY}.slug`)" :hint="t(`${KEY}.locked`)" size="sm">
			<UInput
				:model-value="template.slug"
				icon="i-ph-lock"
				class="w-full font-mono"
				disabled
			/>
			<template #help>{{ t(`${KEY}.slug_help`) }}</template>
		</UFormField>
		<UFormField :label="t(`${KEY}.category`)" size="sm">
			<USelect v-model="category" :items="categoryItems" class="w-full" />
		</UFormField>

		<template v-if="editor.current">
			<USeparator />
			<DmsEyebrow
				:label="t(`${KEY}.envelope`, { locale: editor.locale.toUpperCase() })"
			/>
			<UFormField :label="t('dms_mailing.editor.subject')" size="sm">
				<MailingEditorTokenField v-model="subject" />
				<template #help>{{ subjectHelp }}</template>
			</UFormField>
			<UFormField :label="t('dms_mailing.editor.preheader')" size="sm">
				<MailingEditorTokenField v-model="preheader" />
			</UFormField>
		</template>

		<USeparator />
		<MailingEditorLifecycle />

		<USeparator />
		<div class="flex flex-col gap-2">
			<DmsEyebrow :label="t('dms_mailing.history.title')" />
			<MailingVersionHistory
				v-if="session.state.version > 0"
				:template-id="templateId"
				:current-version="session.state.version"
				:status="session.state.template.status"
				:locale="editor.locale"
				:restore="actions.restoreVersion"
			/>
			<p v-else class="text-muted text-xs">
				{{ t('dms_mailing.history.never_published') }}
			</p>
		</div>
	</div>
</template>
