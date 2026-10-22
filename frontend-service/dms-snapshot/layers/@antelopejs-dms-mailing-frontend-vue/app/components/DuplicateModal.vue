<script setup lang="ts">
import FormFieldRow from '../build/components/FormFieldRow.vue'
import FormRows from '../build/components/FormRows.vue'
import { useMailingApi } from '../composables/useMailingApi'
import {
	useTemplateContentRead,
	useTemplateListRead,
} from '../composables/useMailingReads'
import {
	HTTP_CONFLICT,
	apiErrorMessage,
	apiErrorStatus,
} from '../utils/api-error'
import {
	fitName,
	freeSlug,
	slugify,
	validateName,
	validateSlug,
} from '../utils/slug'
import { editorRoute } from '../utils/editor-route'
import type { TemplateRow } from '../types/mailing'

interface DuplicateModalProps {
	rowData?: TemplateRow
	templateId?: string
	onSuccessCallback?: () => void
}

const props = defineProps<DuplicateModalProps>()
const emit = defineEmits<{ success: [created?: boolean] }>()

const api = useMailingApi()
const toast = useToast()
const { t } = useI18n()
const { processApiMessage } = useTranslation()

const templateId = computed(() => props.rowData?._id ?? props.templateId ?? '')
const readTemplates = useTemplateListRead()
const readContent = useTemplateContentRead(templateId)
const source = ref<TemplateRow | null>(props.rowData ?? null)
const takenSlugs = ref(new Set<string>())
const name = ref('')
const slug = ref('')
const isSlugEdited = ref(false)
const isSubmitted = ref(false)
const saving = ref(false)
const loading = ref(true)

function prefill(template: TemplateRow): void {
	name.value = fitName(template.name, (inner) =>
		t('dms_mailing.duplicate.copy_name', { name: inner }),
	)
	slug.value = freeSlug(slugify(name.value), takenSlugs.value)
}

onMounted(async () => {
	const list = await readTemplates().catch(() => ({ results: [] }))
	takenSlugs.value = new Set(list.results.map((row: TemplateRow) => row.slug))
	source.value ??=
		list.results.find((row: TemplateRow) => row._id === templateId.value) ??
		null
	if (!source.value && templateId.value) {
		const detail = await readContent().catch(() => null)
		source.value = detail?.template ?? null
	}
	if (source.value) prefill(source.value)
	loading.value = false
})

watch(name, (value) => {
	if (!isSlugEdited.value)
		slug.value = freeSlug(slugify(value), takenSlugs.value)
})

const slugIssue = computed(() => validateSlug(slug.value, takenSlugs.value))
const nameIssue = computed(() => validateName(name.value))

const slugError = computed(() =>
	slugIssue.value && (slug.value || isSubmitted.value)
		? t(`dms_mailing.templates.slug_errors.${slugIssue.value}`)
		: null,
)
const nameError = computed(() =>
	nameIssue.value && isSubmitted.value
		? t(`dms_mailing.templates.name_errors.${nameIssue.value}`)
		: null,
)

function onSlugInput(value: string): void {
	isSlugEdited.value = true
	slug.value = value.trim().toLowerCase()
}

function close(created: boolean): void {
	if (created && props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	emit('success', created)
}

function reportFailure(error: unknown): void {
	if (apiErrorStatus(error) === HTTP_CONFLICT) {
		takenSlugs.value = new Set([...takenSlugs.value, slug.value])
		return
	}
	toast.add({
		color: 'error',
		title: processApiMessage(apiErrorMessage(error)),
	})
}

async function submit(): Promise<void> {
	isSubmitted.value = true
	if (slugIssue.value || nameIssue.value || saving.value) return
	saving.value = true
	try {
		const { id } = await api.duplicate(
			templateId.value,
			slug.value,
			name.value.trim(),
		)
		close(true)
		await navigateDms(editorRoute(id))
	} catch (error) {
		reportFailure(error)
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<form
		class="flex flex-col gap-4"
		novalidate
		@submit.prevent="submit"
		@keydown.meta.enter.prevent="submit"
		@keydown.ctrl.enter.prevent="submit"
	>
		<p v-if="source" class="text-muted text-[13px] [overflow-wrap:anywhere]">
			{{ t('dms_mailing.duplicate.source', { name: source.name }) }}
			<span class="font-mono">{{ source.slug }}</span>
		</p>
		<USkeleton v-else-if="loading" class="h-4 w-2/3" />

		<FormRows has-required>
			<FormFieldRow
				:label="t('dms_mailing.templates.cols.name')"
				:error="nameError"
				required
			>
				<template #default="{ id }">
					<DmsInputText
						:id="id"
						v-model="name"
						class="w-full"
						autofocus
						:disabled="loading"
					/>
				</template>
			</FormFieldRow>

			<FormFieldRow
				:label="t('dms_mailing.templates.cols.slug')"
				:error="slugError"
				required
			>
				<template #label-extra>
					<span class="text-dimmed text-xs font-normal">
						{{ t('dms_mailing.new_template.slug_auto') }}
					</span>
				</template>
				<template #default="{ id }">
					<DmsInputText
						:id="id"
						:model-value="slug"
						class="w-full"
						:ui="{ base: 'font-mono' }"
						:disabled="loading"
						:trailing-icon="slugIssue ? undefined : 'i-ph-check-circle'"
						@update:model-value="(value: unknown) => onSlugInput(String(value))"
					/>
				</template>
			</FormFieldRow>
		</FormRows>

		<div
			class="border-default flex items-center justify-end gap-2 border-t pt-4"
		>
			<UButton
				color="neutral"
				variant="outline"
				:label="t('dms_mailing.common.cancel')"
				@click="close(false)"
			/>
			<UButton
				type="submit"
				icon="i-ph-copy"
				:label="t('dms_mailing.duplicate.submit')"
				:loading="saving"
				:disabled="loading || saving"
			/>
		</div>
	</form>
</template>
