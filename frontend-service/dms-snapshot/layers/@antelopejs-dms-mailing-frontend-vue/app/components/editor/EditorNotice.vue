<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import type {
	EditorNotice,
	NoticeAction,
	NoticeTone,
} from '../../utils/lifecycle'
import { noticeMomentOf, publishedMoment } from '../../utils/lifecycle'

interface Props {
	notice: EditorNotice
}

interface NoticeButton {
	icon: string
	labelKey: string
	run: () => unknown
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.notice'

const TONE_CLASSES: Record<NoticeTone, string> = {
	primary: 'border-primary/30 from-primary/15 via-primary/5',
	warning: 'border-warning/40 from-warning/15 via-warning/5',
	error: 'border-error/40 from-error/15 via-error/5',
}

const TONE_ICONS: Record<NoticeTone, string> = {
	primary: 'i-ph-shield-check',
	warning: 'i-ph-eye-slash',
	error: 'i-ph-warning',
}

const TONE_ICON_CLASSES: Record<NoticeTone, string> = {
	primary: 'text-primary',
	warning: 'text-warning',
	error: 'text-error',
}

const { t, locale } = useI18n()
const { session, actions } = useEditorContext()

const BUTTONS: Record<NoticeAction, NoticeButton> = {
	compare: {
		icon: 'i-ph-columns',
		labelKey: `${KEY}.compare`,
		run: () => actions.compare(),
	},
	discard: {
		icon: 'i-ph-arrow-counter-clockwise',
		labelKey: `${KEY}.discard`,
		run: () => actions.discard(),
	},
	reload: {
		icon: 'i-ph-arrows-clockwise',
		labelKey: 'dms_mailing.editor.conflict.reload',
		run: () => actions.reload(),
	},
	overwrite: {
		icon: 'i-ph-upload-simple',
		labelKey: 'dms_mailing.editor.conflict.overwrite',
		run: () => actions.overwrite(),
	},
	retry: {
		icon: 'i-ph-arrows-clockwise',
		labelKey: `${KEY}.retry`,
		run: () => session.save(),
	},
	republish: {
		icon: 'i-ph-rocket-launch',
		labelKey: 'dms_mailing.editor.publish_review.republish',
		run: () => actions.publish(),
	},
}

const text = computed(() => {
	const { state } = session
	const moment = publishedMoment(
		noticeMomentOf(props.notice.kind, state.template),
		String(locale.value),
	)
	const count = state.changes.length
	const params = {
		version: state.version,
		count,
		slug: state.template.slug,
		date: moment?.date ?? '',
		time: moment?.time ?? '',
	}
	return t(`${KEY}.${props.notice.kind}`, params, count)
})

const buttons = computed(() =>
	props.notice.actions.map((action) => ({ action, ...BUTTONS[action] })),
)
</script>

<template>
	<div
		class="text-toned flex h-[38px] shrink-0 items-center gap-2.5 border-b bg-gradient-to-r to-transparent px-4 text-[12.5px]"
		:class="TONE_CLASSES[notice.tone]"
		:role="notice.tone === 'error' ? 'alert' : 'status'"
	>
		<UIcon
			:name="TONE_ICONS[notice.tone]"
			class="size-4 shrink-0"
			:class="TONE_ICON_CLASSES[notice.tone]"
		/>
		<span class="min-w-0 truncate" :title="text">{{ text }}</span>
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<UButton
				v-for="button in buttons"
				:key="button.action"
				size="xs"
				color="neutral"
				variant="ghost"
				:icon="button.icon"
				@click="button.run()"
			>
				{{ t(button.labelKey, { version: session.state.version }) }}
			</UButton>
		</div>
	</div>
</template>
