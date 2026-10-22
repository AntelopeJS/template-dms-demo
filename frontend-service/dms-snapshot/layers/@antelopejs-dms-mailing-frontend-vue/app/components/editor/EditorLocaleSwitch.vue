<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { pickLocale } from '../../utils/locales'

interface LocaleItem {
	code: string
	isMissing: boolean
}

const { t } = useI18n()
const { editor, session } = useEditorContext()

const items = computed<LocaleItem[]>(() =>
	editor.locales.map((code) => ({
		code,
		isMissing: editor.missingLocales.includes(code),
	})),
)

function titleOf(item: LocaleItem): string | undefined {
	if (!item.isMissing) return undefined
	const present = Object.keys(editor.content.locales)
	const fallback = pickLocale(present, item.code, session.state.fallbackLocale)
	return t('dms_mailing.editor.toolbar.locale_missing', {
		fallback: fallback.toUpperCase(),
	})
}
</script>

<template>
	<div
		role="radiogroup"
		:aria-label="t('dms_mailing.editor.toolbar.locale')"
		class="ring-default bg-(--dms-bg-muted) inline-flex h-6 items-center gap-0.5 rounded-lg p-0.5 ring ring-inset"
	>
		<button
			v-for="item in items"
			:key="item.code"
			type="button"
			role="radio"
			:aria-checked="editor.locale === item.code"
			:title="titleOf(item)"
			class="inline-flex h-full items-center gap-1.5 rounded-[6px] px-[7px] font-mono text-[11.5px] transition-colors"
			:class="
				editor.locale === item.code
					? 'text-highlighted ring-accented bg-(--dms-surface-card) shadow-xs font-semibold ring'
					: 'text-muted hover:text-highlighted font-medium'
			"
			@click="editor.setLocale(item.code)"
		>
			<span
				class="size-1.5 rounded-full"
				:class="
					item.isMissing ? 'ring-warning ring-1 ring-inset' : 'bg-success'
				"
			/>
			{{ item.code.toUpperCase() }}
		</button>
	</div>
</template>
