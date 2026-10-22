<script setup lang="ts">
import { computed, nextTick, provide, ref, watch } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { useEditorAnnouncements } from '../../composables/useEditorAnnouncements'
import { TOKEN_DATA_KEY } from '../../utils/tokens'
import type { TokenData } from '../../utils/tokens'
import { emailLogoUrl } from '#dms-layout/app/emails/components/index'

const DEVICE_WIDTHS: Record<string, number> = {
	desktop: 600,
	mobile: 380,
}
/** The e-mail's font stack (`emailStyles.main`), so the paper reads like the mail. */
const EMAIL_FONT =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const SCROLL_OPTIONS: ScrollIntoViewOptions = {
	block: 'nearest',
	behavior: 'smooth',
}

/** The DMS app config the e-mail logo is read from. */
interface EmailBrandingConfig {
	branding?: { logo?: { default?: { light?: string } } }
}

const { t } = useI18n()
const { editor, session } = useEditorContext()
useEditorAnnouncements(editor)

/**
 * The logo header the sent e-mail carries, when it can carry one: the check
 * `EmailLayout` runs with `publicLogoOnly`.
 */
const logoUrl = emailLogoUrl(
	(useDmsAppConfig() as EmailBrandingConfig).branding?.logo?.default?.light,
	useDmsRuntimeConfig().public.dms?.clientBaseUrl ?? '',
)

const canvas = ref<HTMLElement | null>(null)
const lastValidData = ref<Record<string, unknown>>({})

const width = computed(() => `${DEVICE_WIDTHS[editor.device]}px`)
const isTestDataInvalid = computed(
	() => editor.isDataMode && session.testData === null,
)
const tokenData = computed<TokenData>(() =>
	editor.isDataMode ? (session.testData ?? lastValidData.value) : null,
)

watch(
	() => session.testData,
	(data) => {
		if (data) lastValidData.value = data
	},
	{ immediate: true },
)

function blockElement(id: string): HTMLElement | null {
	return (
		canvas.value?.querySelector<HTMLElement>(
			`[data-block-id="${CSS.escape(id)}"]`,
		) ?? null
	)
}

async function revealSelectedBlock(id: string | null): Promise<void> {
	if (!id) return
	await nextTick()
	const element = blockElement(id)
	element?.scrollIntoView(SCROLL_OPTIONS)
	if (document.activeElement === document.body)
		element?.focus({ preventScroll: true })
}

watch(() => editor.selectedId, revealSelectedBlock)

provide(TOKEN_DATA_KEY, tokenData)
</script>

<template>
	<main
		ref="canvas"
		class="min-h-0 min-w-0 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,color-mix(in_srgb,var(--ui-text-highlighted)_7%,transparent)_1px,transparent_0)] bg-[length:18px_18px] px-6 pb-16 pt-7"
		@click="editor.select(null)"
	>
		<div
			class="mx-auto max-w-full transition-[width] duration-200"
			:style="{ width }"
		>
			<UAlert
				v-if="isTestDataInvalid"
				color="warning"
				variant="subtle"
				icon="i-ph-warning"
				class="mb-3"
				:title="t('dms_mailing.editor.data.invalid_json_banner')"
				:actions="[
					{
						label: t('dms_mailing.editor.inspector.data'),
						color: 'warning',
						variant: 'outline',
						onClick: () => (editor.rightTab = 'data'),
					},
				]"
				@click.stop
			/>
			<MailingEditorMissingLocale v-if="!editor.current" />
			<template v-else>
				<MailingEditorEnvelope />
				<div
					class="rounded-lg bg-white px-9 py-8 text-gray-900 shadow-xl"
					:style="{ fontFamily: EMAIL_FONT }"
					@click.stop="editor.select(null)"
				>
					<img
						v-if="logoUrl"
						:src="logoUrl"
						alt=""
						class="mx-auto mb-8 block h-[60px]"
					/>
					<MailingEditorBlockList :list="editor.current.blocks" />
				</div>
			</template>
		</div>
	</main>
</template>
