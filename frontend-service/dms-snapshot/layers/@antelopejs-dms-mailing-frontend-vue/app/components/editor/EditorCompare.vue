<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
	PreviewResponse,
	TemplateChange,
	TemplateContent,
} from '../../types/mailing'
import { useMailingApi } from '../../composables/useMailingApi'
import { describeChanges } from '../../utils/changes'

interface Props {
	templateId: string
	locale: string
	/** The workspace locales; the switch offers those either side carries. */
	locales?: string[]
	content: TemplateContent
	publishedContent?: TemplateContent | null
	changes?: TemplateChange[]
	data?: Record<string, unknown>
}

type SideId = 'published' | 'draft'

interface ComparedSide {
	id: SideId
	label: string
	preview: PreviewResponse | null
	preheader: string
	/** Shown when the side renders another locale than the one asked. */
	fallbackNote: string
}

const props = withDefaults(defineProps<Props>(), {
	locales: () => [],
	publishedContent: null,
	changes: () => [],
	data: undefined,
})

const KEY = 'dms_mailing.editor.compare'
const FRAME_SANDBOX = 'allow-same-origin'
const INITIAL_FRAME_HEIGHT = 480

const { t } = useI18n()
const api = useMailingApi()

const locale = ref(props.locale)
const previews = ref<Record<SideId, PreviewResponse | null>>({
	published: null,
	draft: null,
})
const failed = ref(false)
const heights = ref<Record<SideId, number>>({
	published: INITIAL_FRAME_HEIGHT,
	draft: INITIAL_FRAME_HEIGHT,
})

/** Fits a frame to its e-mail, so neither side scrolls on its own. */
function fit(event: Event, side: SideId): void {
	const body = (event.target as HTMLIFrameElement).contentDocument?.body
	if (!body) return
	const margin = Number.parseFloat(getComputedStyle(body).marginBottom) || 0
	const height = Math.ceil(body.getBoundingClientRect().bottom + margin)
	if (height) heights.value = { ...heights.value, [side]: height }
}

const localeItems = computed(() => {
	const carried = new Set([
		...Object.keys(props.content.locales),
		...Object.keys(props.publishedContent?.locales ?? {}),
	])
	const ordered = [...props.locales, ...carried].filter((code) =>
		carried.has(code),
	)
	return [...new Set(ordered)].map((code) => ({
		label: code.toUpperCase(),
		value: code,
	}))
})

const lines = computed(() =>
	describeChanges(
		props.changes.filter((change) => change.locale === locale.value),
		{ draft: props.content, published: props.publishedContent },
		(key, params) => t(key, params ?? {}),
	),
)

function fallbackNote(preview: PreviewResponse | null): string {
	if (!preview || preview.locale === locale.value) return ''
	return t(`${KEY}.fallback`, {
		locale: locale.value.toUpperCase(),
		fallback: preview.locale.toUpperCase(),
	})
}

function preheaderOf(
	content: TemplateContent | null,
	preview: PreviewResponse | null,
): string {
	return preview ? (content?.locales[preview.locale]?.preheader ?? '') : ''
}

const sides = computed<ComparedSide[]>(() => {
	const { published, draft } = previews.value
	return [
		{
			id: 'published',
			label: t(`${KEY}.live`),
			preview: published,
			preheader: preheaderOf(props.publishedContent, published),
			fallbackNote: fallbackNote(published),
		},
		{
			id: 'draft',
			label: t(`${KEY}.draft`),
			preview: draft,
			preheader: preheaderOf(props.content, draft),
			fallbackNote: fallbackNote(draft),
		},
	]
})

async function load(): Promise<void> {
	const base = { locale: locale.value, data: props.data }
	failed.value = false
	previews.value = { published: null, draft: null }
	try {
		const [published, draft] = await Promise.all([
			api.preview(props.templateId, { ...base, version: 'published' }),
			api.preview(props.templateId, { ...base, content: props.content }),
		])
		previews.value = { published, draft }
	} catch {
		failed.value = true
	}
}

watch(locale, load, { immediate: true })
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-3">
			<UTabs
				v-if="localeItems.length > 1"
				v-model="locale"
				:items="localeItems"
				:content="false"
				size="xs"
			/>
			<ul
				v-if="lines.length"
				class="text-muted flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs"
			>
				<li
					v-for="line in lines"
					:key="line.key"
					class="flex items-center gap-1"
				>
					<UIcon :name="line.icon" class="text-primary size-3.5 shrink-0" />
					{{ line.text }}
				</li>
			</ul>
		</div>

		<DmsEmptyState
			v-if="failed"
			variant="error"
			size="sm"
			:title="t(`${KEY}.error`)"
		/>
		<div v-else class="grid gap-4 md:grid-cols-2">
			<section
				v-for="side in sides"
				:key="side.id"
				class="flex min-w-0 flex-col gap-2"
			>
				<div class="flex min-w-0 flex-col gap-0.5">
					<div class="flex items-center gap-2">
						<DmsEyebrow :label="side.label" />
						<span
							v-if="side.preview"
							class="text-highlighted min-w-0 truncate text-xs font-medium"
						>
							{{ side.preview.subject }}
						</span>
					</div>
					<span v-if="side.preheader" class="text-muted truncate text-xs">
						{{ side.preheader }}
					</span>
					<span v-if="side.fallbackNote" class="text-warning text-xs">
						{{ side.fallbackNote }}
					</span>
				</div>
				<div class="border-default overflow-hidden rounded-md border">
					<iframe
						v-if="side.preview"
						:srcdoc="side.preview.html"
						:sandbox="FRAME_SANDBOX"
						:title="side.label"
						class="block w-full border-0 bg-white"
						:style="{ height: `${heights[side.id]}px` }"
						@load="fit($event, side.id)"
					/>
					<USkeleton v-else class="h-[60vh] w-full" />
				</div>
			</section>
		</div>
	</div>
</template>
