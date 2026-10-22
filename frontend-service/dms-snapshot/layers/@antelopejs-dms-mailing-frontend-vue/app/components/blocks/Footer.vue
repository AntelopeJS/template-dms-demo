<script setup lang="ts">
import { computed, inject } from 'vue'
import type { FooterBlock } from '../../types/mailing'
import { TOKEN_DATA_KEY } from '../../utils/tokens'
import { FOOTER_LINK_PATHS, hasSystemUrl } from '../../utils/system-variables'

interface Props {
	block: FooterBlock
}

interface FooterLink {
	key: string
	label: string
	path: string
	/** Data mode carries the URL: the link looks as the recipient sees it. */
	hasUrl: boolean
}

type FooterLabelKey = keyof typeof FOOTER_LINK_PATHS

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.footer'
const LINK_SEPARATOR = ' · '

const { t } = useI18n()
const data = inject(TOKEN_DATA_KEY, null)

const links = computed<FooterLink[]>(() =>
	(Object.keys(FOOTER_LINK_PATHS) as FooterLabelKey[])
		.filter((key) => props.block[key].trim())
		.map((key) => ({
			key,
			label: props.block[key],
			path: FOOTER_LINK_PATHS[key],
			hasUrl: hasSystemUrl(data?.value, FOOTER_LINK_PATHS[key]),
		})),
)
const isEmpty = computed(() => !props.block.text.trim() && !links.value.length)
const hasPendingUrl = computed(() => links.value.some((link) => !link.hasUrl))
</script>

<template>
	<div
		class="mt-6 border-t border-gray-200 pt-4 text-center text-xs leading-relaxed text-gray-500"
	>
		<p v-if="isEmpty" class="italic text-gray-500">
			{{ t(`${KEY}.empty`) }}
		</p>
		<MailingTokenText v-else :text="block.text" />
		<p v-if="links.length" class="mt-1">
			<template v-for="(link, index) in links" :key="link.key">
				<template v-if="index > 0">{{ LINK_SEPARATOR }}</template>
				<span
					class="underline"
					:class="link.hasUrl ? '' : 'text-gray-400 decoration-dotted'"
					:title="
						link.hasUrl
							? undefined
							: t(`${KEY}.url_at_send`, { path: link.path })
					"
				>
					{{ link.label }}
				</span>
			</template>
		</p>
		<p v-if="hasPendingUrl" class="mt-0.5 text-[10px] italic text-gray-500">
			{{ t(`${KEY}.url_at_send_hint`) }}
		</p>
	</div>
</template>
