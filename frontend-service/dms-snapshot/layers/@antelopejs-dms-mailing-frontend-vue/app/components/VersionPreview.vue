<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import type { PreviewResponse, TemplateVersionSummary } from '../types/mailing'
import { describeChanges, NO_SOURCES } from '../utils/changes'
import { parseLocaleList } from '../utils/locales'
import { variableTypeLabelKey } from '../utils/variable-types'
import type { VersionPreviewChoice } from '../utils/version-history'

interface VersionPreviewProps {
	templateId: string
	version: TemplateVersionSummary
	/** The version customers already receive: nothing to restore. */
	isCurrent?: boolean
	/** The locale shown first, when the version carries it. */
	initialLocale?: string
}

const PREVIEW_WIDTH = 600
const KEY = 'dms_mailing.history'

const props = withDefaults(defineProps<VersionPreviewProps>(), {
	isCurrent: false,
	initialLocale: undefined,
})
const emit = defineEmits<{ success: [VersionPreviewChoice] }>()

const { t } = useI18n()

const locales = computed(() => parseLocaleList(props.version.locales))
const locale = ref(
	props.initialLocale && locales.value.includes(props.initialLocale)
		? props.initialLocale
		: (locales.value[0] ?? ''),
)
const subject = ref('')
const previewBox = ref<HTMLElement | null>(null)
const { width: previewBoxWidth } = useElementSize(previewBox)

const previewScale = computed(() =>
	previewBoxWidth.value
		? Math.min(1, previewBoxWidth.value / PREVIEW_WIDTH)
		: 1,
)

const localeItems = computed(() =>
	locales.value.map((code) => ({ label: code.toUpperCase(), value: code })),
)

const lines = computed(() =>
	describeChanges(props.version.changes, NO_SOURCES, (key, params) =>
		t(key, params ?? {}),
	),
)

const declared = computed(() => props.version.variables)

function onResolved(preview: PreviewResponse): void {
	subject.value = preview.subject
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-2">
			<DmsSegmented
				v-if="localeItems.length > 1"
				v-model="locale"
				:items="localeItems"
				size="xs"
				:aria-label="t('dms_mailing.test_send.locale')"
			/>
			<span
				v-if="subject"
				class="text-muted min-w-0 truncate text-[12.5px]"
				:title="subject"
			>
				{{ t('dms_mailing.templates.drawer.subject', { subject }) }}
			</span>
		</div>
		<div
			class="border-default bg-elevated/40 overflow-hidden rounded-lg border p-3"
		>
			<div ref="previewBox" class="flex justify-center">
				<MailingTemplatePreviewFrame
					:template-id="templateId"
					:locale="locale || undefined"
					:version="version.version"
					:width="PREVIEW_WIDTH"
					:scale="previewScale"
					:label="t(`${KEY}.version`, { version: version.version })"
					@resolved="onResolved"
				/>
			</div>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<DmsEyebrow :label="t(`${KEY}.brought`)" />
				<ul v-if="lines.length" class="flex flex-col gap-1 text-[12.5px]">
					<li
						v-for="line in lines"
						:key="line.key"
						class="text-toned flex gap-2"
					>
						<UIcon
							:name="line.icon"
							class="text-primary mt-0.5 size-3.5 shrink-0"
						/>
						<span>{{ line.text }}</span>
					</li>
				</ul>
				<p v-else class="text-muted text-[12.5px]">
					{{ t(`${KEY}.no_changes`) }}
				</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<DmsEyebrow :label="t(`${KEY}.declared`)" />
				<p v-if="!declared.length" class="text-muted text-[12.5px]">
					{{ t(`${KEY}.no_variables`) }}
				</p>
				<div
					v-for="variable in declared"
					:key="variable.path"
					class="flex items-center gap-2 text-[12px]"
				>
					<code class="text-toned truncate font-mono">{{ variable.path }}</code>
					<span
						v-if="variable.required"
						class="text-error"
						:title="t('dms_mailing.templates.drawer.required')"
					>
						*
					</span>
					<span class="text-dimmed ml-auto font-mono text-[11px]">
						{{ t(variableTypeLabelKey(variable.type)) }}
					</span>
				</div>
			</div>
		</div>

		<div
			class="border-default -mx-1 flex flex-wrap items-center gap-2 border-t pt-4"
		>
			<p v-if="!isCurrent" class="text-muted min-w-0 flex-1 text-xs">
				{{ t(`${KEY}.restore_hint`) }}
			</p>
			<UButton
				class="ml-auto"
				color="neutral"
				variant="outline"
				@click="emit('success', 'close')"
			>
				{{ t(`${KEY}.close`) }}
			</UButton>
			<UButton
				v-if="!isCurrent"
				icon="i-ph-arrow-counter-clockwise"
				@click="emit('success', 'restore')"
			>
				{{ t(`${KEY}.restore`, { version: version.version }) }}
			</UButton>
		</div>
	</div>
</template>
