<script setup lang="ts">
import { useDebounceFn, useIntersectionObserver } from '@vueuse/core'
import { useMailingApi } from '../composables/useMailingApi'
import { useStarterPreviewRead } from '../composables/useMailingReads'
import type {
	PreviewResponse,
	PreviewVersion,
	TemplateContent,
} from '../types/mailing'

interface TemplatePreviewFrameProps {
	/** The template to render; ignored when `html` or `starterId` is given. */
	templateId?: string
	/** A starter to render, through its own preview endpoint. */
	starterId?: string
	/** Ready-made HTML: nothing is fetched. */
	html?: string
	/**
	 * Absent renders the tenant fallback locale, chosen server-side; a starter
	 * then renders in the interface's language when it has it.
	 */
	locale?: string
	/** Which saved content to render when `content` is absent. */
	version?: PreviewVersion
	content?: TemplateContent
	data?: Record<string, unknown>
	width: number
	scale?: number
	refreshKey?: number
	/** Fetches only once the frame scrolls into view (galleries). */
	lazy?: boolean
	/** Accessible name of the frame. */
	label?: string
	/**
	 * A thumbnail: out of the accessibility tree and the tab order (the card
	 * around it names the template).
	 */
	decorative?: boolean
}

const DEBOUNCE_MS = 300
const FALLBACK_HEIGHT = 480
const NO_SCROLL_STYLE = '<style>html,body{overflow:hidden}</style>'
const HEAD_END = /<\/head>/i

const props = withDefaults(defineProps<TemplatePreviewFrameProps>(), {
	templateId: undefined,
	starterId: undefined,
	html: undefined,
	locale: undefined,
	version: undefined,
	content: undefined,
	data: undefined,
	scale: 1,
	refreshKey: 0,
	lazy: false,
	label: undefined,
	decorative: false,
})

const emit = defineEmits<{ resolved: [PreviewResponse] }>()

const api = useMailingApi()
const { locale: uiLocale } = useI18n()

const readStarterPreview = useStarterPreviewRead(
	() => props.starterId,
	() => props.locale ?? uiLocale.value,
)
const fetchedHtml = ref('')
const loading = ref(false)
const height = ref(FALLBACK_HEIGHT)
const frame = ref<HTMLIFrameElement | null>(null)
const box = ref<HTMLElement | null>(null)
const isVisible = ref(!props.lazy)

/**
 * The HTML with scrolling turned off inside its own document: the frame is
 * sized to the content, a scrollbar would only eat its width.
 */
function withoutScroll(html: string): string {
	if (!html) return html
	return HEAD_END.test(html)
		? html.replace(HEAD_END, `${NO_SCROLL_STYLE}</head>`)
		: `${NO_SCROLL_STYLE}${html}`
}

const shownHtml = computed(() => withoutScroll(props.html ?? fetchedHtml.value))

useIntersectionObserver(box, ([entry]) => {
	if (entry?.isIntersecting) isVisible.value = true
})

async function fetchStarter(): Promise<void> {
	const preview = await readStarterPreview()
	fetchedHtml.value = preview.html
}

async function fetchTemplate(templateId: string): Promise<void> {
	const preview = await api.preview(templateId, {
		locale: props.locale,
		version: props.content ? undefined : props.version,
		content: props.content,
		data: props.data,
	})
	fetchedHtml.value = preview.html
	emit('resolved', preview)
}

async function load(): Promise<void> {
	if (props.html !== undefined || !isVisible.value) return
	if (!props.starterId && !props.templateId) return
	loading.value = true
	try {
		await (props.starterId
			? fetchStarter()
			: fetchTemplate(props.templateId as string))
	} catch {
		fetchedHtml.value = ''
	} finally {
		loading.value = false
	}
}

const reload = useDebounceFn(load, DEBOUNCE_MS)

/**
 * The content's full height, the body's bottom margin included: its
 * `scrollHeight` leaves the margins out and the frame would scroll by them.
 */
function measure(): void {
	const body = frame.value?.contentDocument?.body
	const view = frame.value?.contentWindow
	if (!body || !view) {
		height.value = FALLBACK_HEIGHT
		return
	}
	const bottom =
		body.getBoundingClientRect().bottom +
		parseFloat(view.getComputedStyle(body).marginBottom)
	height.value = Math.ceil(bottom) || FALLBACK_HEIGHT
}

watch(
	() => [
		props.templateId,
		props.starterId,
		props.starterId ? uiLocale.value : undefined,
		props.locale,
		props.version,
		props.content,
		props.data,
		props.refreshKey,
		isVisible.value,
	],
	() => reload(),
	{ immediate: true, deep: true },
)

const boxStyle = computed(() => ({
	width: `${props.width * props.scale}px`,
	height: `${height.value * props.scale}px`,
}))

const frameStyle = computed(() => ({
	width: `${props.width}px`,
	height: `${height.value}px`,
	transform: `scale(${props.scale})`,
	transformOrigin: 'top left',
}))
</script>

<template>
	<div ref="box" class="relative overflow-hidden" :style="boxStyle">
		<USkeleton
			v-if="!shownHtml && (loading || !isVisible)"
			class="absolute inset-0 size-full"
		/>
		<iframe
			v-show="shownHtml"
			ref="frame"
			:srcdoc="shownHtml"
			sandbox="allow-same-origin"
			loading="lazy"
			tabindex="-1"
			:title="label ?? 'preview'"
			:aria-hidden="decorative ? 'true' : undefined"
			:inert="decorative || undefined"
			scrolling="no"
			class="block border-0 bg-white"
			:style="frameStyle"
			@load="measure"
		/>
	</div>
</template>
