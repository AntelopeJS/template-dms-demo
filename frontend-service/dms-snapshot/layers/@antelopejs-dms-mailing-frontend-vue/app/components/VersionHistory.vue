<script setup lang="ts">
import type { Component } from 'vue'
import { useTemplateVersionsRead } from '../composables/useMailingReads'
import type { TemplateStatus, TemplateVersionSummary } from '../types/mailing'
import { apiErrorMessage } from '../utils/api-error'
import {
	changeSummary,
	formatVersionDate,
	isLiveVersion,
} from '../utils/version-history'
import type { VersionPreviewChoice } from '../utils/version-history'

interface VersionHistoryProps {
	templateId: string
	/** The version customers receive (or last received); 0 when never published. */
	currentVersion: number
	status?: TemplateStatus
	/** The locale a preview opens on, when the version carries it. */
	locale?: string
	/** Copies a version into the draft; the caller reloads what it shows. */
	restore: (version: number) => Promise<unknown>
}

const PREVIEW_COMPONENT = 'MailingVersionPreview'
const PREVIEW_SIZE = '3xl'
const RESTORE_ICON = 'i-ph-arrow-counter-clockwise'
const KEY = 'dms_mailing.history'

const props = withDefaults(defineProps<VersionHistoryProps>(), {
	status: undefined,
	locale: undefined,
})

const modal = useModal()
const toast = useToast()
const { confirm } = useConfirm()
const { t, locale: uiLocale } = useI18n()
const { processApiMessage } = useTranslation()
const previewComponent = resolveComponent(PREVIEW_COMPONENT) as Component

const readVersions = useTemplateVersionsRead(() => props.templateId)
const versions = ref<TemplateVersionSummary[]>([])
const loading = ref(true)

async function load(): Promise<void> {
	loading.value = true
	try {
		versions.value = (await readVersions()).versions
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	} finally {
		loading.value = false
	}
}

onMounted(load)

const translate = (key: string, params?: Record<string, string>) =>
	t(key, params ?? {})

const rows = computed(() =>
	versions.value.map((version) => {
		const summary = changeSummary(version, translate)
		return {
			version,
			isLive: isLiveVersion(
				version.version,
				props.currentVersion,
				props.status,
			),
			isCurrent: version.version === props.currentVersion,
			meta: [
				formatVersionDate(version.publishedAt, uiLocale.value),
				version.publishedBy,
			].filter(Boolean),
			summary: summary.more
				? t(
						`${KEY}.summary_more`,
						{ changes: summary.named.join(', '), count: summary.more },
						summary.more,
					)
				: summary.named.join(', ') || t(`${KEY}.no_changes`),
		}
	}),
)

function isRestoreConfirmed(version: number): Promise<boolean> {
	return confirm({
		title: t(`${KEY}.restore_title`, { version }),
		description: t(`${KEY}.restore_description`, {
			version,
			current: props.currentVersion,
		}),
		color: 'warning',
		icon: RESTORE_ICON,
		confirmLabel: t(`${KEY}.restore`, { version }),
		cancelLabel: t('dms_mailing.common.cancel'),
	})
}

async function confirmRestore(version: number): Promise<void> {
	if (!(await isRestoreConfirmed(version))) return
	await props.restore(version)
}

async function preview(version: TemplateVersionSummary): Promise<void> {
	const choice = await modal.open<VersionPreviewChoice>({
		title: t(`${KEY}.preview_title`, { version: version.version }),
		description: [
			formatVersionDate(version.publishedAt, uiLocale.value),
			version.publishedBy,
		]
			.filter(Boolean)
			.join(' · '),
		icon: 'i-ph-clock-counter-clockwise',
		component: previewComponent,
		componentOptions: {
			templateId: props.templateId,
			version,
			isCurrent: version.version === props.currentVersion,
			initialLocale: props.locale,
		},
		size: PREVIEW_SIZE,
	}).result
	if (choice === 'restore') await confirmRestore(version.version)
}
</script>

<template>
	<div class="flex flex-col gap-1">
		<USkeleton v-if="loading && !versions.length" class="h-24 w-full" />
		<p v-else-if="!versions.length" class="text-muted text-[12.5px]">
			{{ t(`${KEY}.empty`) }}
		</p>
		<DmsListRow
			v-for="row in rows"
			:key="row.version.version"
			as="div"
			size="sm"
			:meta="row.meta"
			:current="row.isLive"
		>
			<template #leading>
				<span
					class="bg-elevated text-toned grid h-7 min-w-9 shrink-0 place-items-center rounded-md px-1.5 font-mono text-[12px] font-semibold"
				>
					v{{ row.version.version }}
				</span>
			</template>
			<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
				<span class="[overflow-wrap:anywhere]">{{ row.summary }}</span>
				<DmsStatusPill
					v-if="row.isLive"
					size="sm"
					tone="success"
					dot="live"
					:label="t(`${KEY}.live`)"
				/>
			</span>
			<template #trailing>
				<span class="flex items-center gap-0.5">
					<UTooltip :text="t(`${KEY}.preview`)">
						<UButton
							icon="i-ph-eye"
							color="neutral"
							variant="ghost"
							size="xs"
							square
							:aria-label="t(`${KEY}.preview`)"
							@click="preview(row.version)"
						/>
					</UTooltip>
					<UTooltip
						v-if="!row.isCurrent"
						:text="t(`${KEY}.restore`, { version: row.version.version })"
					>
						<UButton
							:icon="RESTORE_ICON"
							color="neutral"
							variant="ghost"
							size="xs"
							square
							:aria-label="
								t(`${KEY}.restore`, { version: row.version.version })
							"
							@click="confirmRestore(row.version.version)"
						/>
					</UTooltip>
				</span>
			</template>
		</DmsListRow>
	</div>
</template>
