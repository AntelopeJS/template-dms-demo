<script setup lang="ts">
import { useTemplateCategories } from '../composables/useTemplateCategories'
import { useLocalizedDefaults } from '../composables/useLocalizedDefaults'
import { useMailingApi } from '../composables/useMailingApi'
import { useStarters } from '../composables/useMailingReads'
import { useTemplateDrawer } from '../composables/useTemplateDrawer'
import {
	HTTP_CONFLICT,
	apiErrorMessage,
	apiErrorStatus,
} from '../utils/api-error'
import { editorRoute } from '../utils/editor-route'
import type { StarterSummary } from '../types/mailing'

const PREVIEW_WIDTH = 600
const PREVIEW_SCALE = 0.32
const SKELETON_STARTERS = 4

const emit = defineEmits<{ created: [] }>()

const api = useMailingApi()
const toast = useToast()
const { t } = useI18n()
const { processApiMessage } = useTranslation()
const overlays = useTemplateDrawer()

const localized = useLocalizedDefaults()
const starterList = useStarters()
/** The starters, none when the read failed. */
const starters = computed(() =>
	localized.starters(
		starterList.error.value ? [] : (starterList.data.value?.starters ?? []),
	),
)
const { categories } = useTemplateCategories()
const loading = computed(
	() => !starterList.data.value && !starterList.error.value,
)
const creatingId = ref<string | null>(null)

function knownCategory(id: string): string | undefined {
	return categories.value.some((category) => category.id === id)
		? id
		: undefined
}

function openNewTemplate(starter?: StarterSummary): void {
	overlays.openNewTemplate({
		initialName: starter?.name,
		initialStarterId: starter?.id,
		onDone: () => emit('created'),
	})
}

async function createFrom(starter: StarterSummary): Promise<void> {
	if (creatingId.value) return
	creatingId.value = starter.id
	try {
		const [id] = await api.createTemplate({
			name: starter.name,
			slug: starter.slug,
			category: knownCategory(starter.category),
			starterId: starter.id,
		})
		emit('created')
		if (id) await navigateDms(editorRoute(id))
	} catch (error) {
		if (apiErrorStatus(error) === HTTP_CONFLICT) {
			openNewTemplate(starter)
			return
		}
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	} finally {
		creatingId.value = null
	}
}
</script>

<template>
	<DmsEmptyState
		:title="t('dms_mailing.templates.starters.title')"
		:description="t('dms_mailing.templates.starters.description')"
		icon="i-ph-envelope-simple"
		variant="no-data"
		size="lg"
		hatched
	>
		<template #actions>
			<div class="flex w-full max-w-[780px] flex-col items-center gap-4">
				<div class="grid w-full grid-cols-2 gap-3 md:grid-cols-4">
					<template v-if="loading">
						<USkeleton
							v-for="index in SKELETON_STARTERS"
							:key="index"
							class="rounded-(--dms-radius-card) h-[150px] w-full"
						/>
					</template>
					<DmsCard
						v-for="starter in starters"
						v-else
						:key="starter.id"
						as="button"
						type="button"
						:padded="false"
						interactive
						class="flex flex-col overflow-hidden text-left"
						:aria-busy="creatingId === starter.id"
						:disabled="Boolean(creatingId)"
						@click="createFrom(starter)"
					>
						<div
							class="bg-elevated/40 pointer-events-none flex h-[96px] justify-center overflow-hidden pt-2"
						>
							<MailingTemplatePreviewFrame
								:starter-id="starter.id"
								:width="PREVIEW_WIDTH"
								:scale="PREVIEW_SCALE"
								:label="starter.name"
								decorative
							/>
						</div>
						<div
							class="border-default flex flex-col gap-0.5 border-t px-3 py-2.5"
						>
							<span
								class="text-highlighted flex items-center gap-1.5 text-[12.5px] font-semibold"
							>
								{{ starter.name }}
								<UIcon
									v-if="creatingId === starter.id"
									name="i-ph-spinner"
									class="size-3.5 animate-spin"
								/>
							</span>
							<span class="text-dimmed truncate font-mono text-[11px]">
								{{ starter.slug }}
							</span>
						</div>
					</DmsCard>
				</div>
				<UButton
					icon="i-ph-plus"
					color="neutral"
					variant="outline"
					size="sm"
					:label="t('dms_mailing.templates.starters.blank')"
					@click="openNewTemplate()"
				/>
			</div>
		</template>
	</DmsEmptyState>
</template>
