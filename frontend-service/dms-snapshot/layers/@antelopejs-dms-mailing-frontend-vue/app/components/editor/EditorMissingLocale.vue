<script setup lang="ts">
import { computed } from 'vue'
import { useBlockContext } from '../../composables/useBlockContext'
import { useEditorContext } from '../../composables/useEditorContext'
import { localeLanguage, pickLocale } from '../../utils/locales'

const KEY = 'dms_mailing.editor.missing_locale'

const { t } = useI18n()
const { editor, session } = useEditorContext()
const blockContext = useBlockContext()

const locale = computed(() => editor.locale.toUpperCase())
const present = computed(() => Object.keys(editor.content.locales))

/** The workspace fallback is the locale missing: sends go to the first one carried. */
const isFallbackMissing = computed(
	() => editor.locale === session.state.fallbackLocale,
)

/** What a send asking for this locale gets today, as the server picks it. */
const source = computed(() =>
	pickLocale(present.value, editor.locale, session.state.fallbackLocale),
)

const affected = computed(() =>
	(session.state.performance?.fallbacks ?? [])
		.filter(
			(entry) =>
				localeLanguage(entry.requested) === localeLanguage(editor.locale),
		)
		.reduce((sum, entry) => sum + entry.count, 0),
)

const canDuplicate = computed(
	() => source.value !== editor.locale && present.value.includes(source.value),
)

const description = computed(() => {
	const params = {
		locale: locale.value,
		fallback: source.value.toUpperCase(),
		first: source.value.toUpperCase(),
		count: affected.value,
	}
	if (!present.value.length) return t(`${KEY}.no_locale`, params)
	if (isFallbackMissing.value) return t(`${KEY}.fallback_is_missing`, params)
	return affected.value > 0
		? t(`${KEY}.affected`, params, affected.value)
		: t(`${KEY}.hint`, params)
})

const actions = computed(() => [
	...(canDuplicate.value
		? [
				{
					label: t(`${KEY}.duplicate`, {
						fallback: source.value.toUpperCase(),
					}),
					icon: 'i-ph-copy',
					onClick: () => editor.createLocale(editor.locale, source.value),
				},
			]
		: []),
	{
		label: t(`${KEY}.blank`),
		color: 'neutral' as const,
		variant: canDuplicate.value ? ('ghost' as const) : ('solid' as const),
		onClick: () =>
			editor.createLocale(editor.locale, undefined, blockContext()),
	},
])
</script>

<template>
	<div class="border-default bg-default shadow-xs mt-10 rounded-lg border">
		<DmsEmptyState
			icon="i-ph-globe-hemisphere-west"
			tone="warning"
			size="lg"
			:title="t(`${KEY}.title_short`, { locale })"
			:description="description"
			:actions="actions"
		/>
	</div>
</template>
