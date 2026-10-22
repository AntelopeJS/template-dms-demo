<script setup lang="ts">
import { computed } from 'vue'
import { emailStyles } from '#dms-layout/app/emails/components/index'
import MailingTextLines from './MailingTextLines.vue'
import type {
	ResolvedBlock,
	ResolvedButton,
	ResolvedFooter,
	ResolvedHeading,
	ResolvedParagraph,
} from '../../types/mailing'

interface FooterLink {
	label: string
	href: string
}

const FOOTER_TYPE = 'footer'
const FOOTER_LINK_SEPARATOR = ' · '

/** Long words (a URL, a reference) wrap instead of widening the e-mail. */
const wrap = { overflowWrap: 'anywhere', wordBreak: 'break-word' }
const blockSpacing = { margin: '0 0 16px' }
const textStyle = { ...emailStyles.text, ...wrap }
const heroStyle = {
	display: 'block',
	width: '100%',
	borderRadius: '8px',
	margin: '0 0 20px',
}
const cellStyle = { ...textStyle, margin: '0' }
const valueCellStyle = { ...cellStyle, textAlign: 'right' as const }
const totalStyle = { ...cellStyle, fontWeight: '600' }
const totalValueStyle = { ...valueCellStyle, fontWeight: '600' }
const codeStyle = { ...emailStyles.otp.code, ...wrap }
const dividerStyle = { border: '0', ...emailStyles.divider }
/** Darker than the DMS footer grey: small print stays readable (4.8:1). */
const FOOTER_TEXT_COLOR = '#71717a'
const footerStyle = {
	...emailStyles.footer,
	color: FOOTER_TEXT_COLOR,
	...wrap,
}
const footerLinkStyle = {
	color: FOOTER_TEXT_COLOR,
	textDecoration: 'underline',
}

interface Props {
	blocks: ResolvedBlock[]
	footerOnly?: boolean
}

const props = defineProps<Props>()

/** A footer with neither text nor link would draw a lone divider. */
const isEmptyFooter = (block: ResolvedBlock): boolean =>
	block.type === FOOTER_TYPE && !block.text.trim() && !footerLinks(block).length

const visibleBlocks = computed(() =>
	props.blocks
		.filter((block) =>
			props.footerOnly
				? block.type === FOOTER_TYPE
				: block.type !== FOOTER_TYPE,
		)
		.filter((block) => !isEmptyFooter(block)),
)

const headingStyle = (block: ResolvedHeading) => ({
	...emailStyles.heading,
	...wrap,
	textAlign: block.align,
	fontSize: `${block.size}px`,
})

const paragraphStyle = (block: ResolvedParagraph) => ({
	...textStyle,
	textAlign: block.align,
})

const buttonRowStyle = (block: ResolvedButton) => ({
	...emailStyles.buttonContainer,
	textAlign: block.align,
})

function footerLinks(block: ResolvedFooter): FooterLink[] {
	return [
		{ label: block.unsubscribeLabel, href: block.unsubscribeUrl },
		{ label: block.preferencesLabel, href: block.preferencesUrl },
	].filter((link) => link.href && link.label.trim())
}
</script>

<template>
	<template v-for="block in visibleBlocks" :key="block.id">
		<EImg
			v-if="block.type === 'hero' && block.imageUrl"
			:src="block.imageUrl"
			:alt="block.alt"
			:style="heroStyle"
		/>

		<EHeading
			v-else-if="block.type === 'heading'"
			as="h1"
			:style="headingStyle(block)"
		>
			<MailingTextLines :text="block.text" />
		</EHeading>

		<EText
			v-else-if="block.type === 'paragraph'"
			:style="paragraphStyle(block)"
		>
			<MailingTextLines :text="block.text" />
		</EText>

		<ESection v-else-if="block.type === 'code'" :style="emailStyles.otp.box">
			<EText :style="codeStyle">{{ block.text }}</EText>
		</ESection>

		<ESection v-else-if="block.type === 'list'" :style="blockSpacing">
			<ERow v-for="(row, index) in block.rows" :key="index">
				<EColumn>
					<EText :style="cellStyle">{{ row.label }}</EText>
				</EColumn>
				<EColumn align="right">
					<EText :style="valueCellStyle">{{ row.value }}</EText>
				</EColumn>
			</ERow>
		</ESection>

		<ESection v-else-if="block.type === 'total'" :style="blockSpacing">
			<ERow>
				<EColumn>
					<EText :style="totalStyle">{{ block.label }}</EText>
				</EColumn>
				<EColumn align="right">
					<EText :style="totalValueStyle">{{ block.value }}</EText>
				</EColumn>
			</ERow>
		</ESection>

		<ESection
			v-else-if="block.type === 'button'"
			:style="buttonRowStyle(block)"
		>
			<EButton :href="block.href" :style="emailStyles.button">
				{{ block.text }}
			</EButton>
		</ESection>

		<EHr v-else-if="block.type === 'divider'" :style="dividerStyle" />

		<template v-else-if="block.type === 'footer'">
			<EHr :style="dividerStyle" />
			<EText :style="footerStyle">
				<MailingTextLines :text="block.text" />
				<template v-if="footerLinks(block).length">
					<br />
					<template
						v-for="(link, index) in footerLinks(block)"
						:key="link.href"
					>
						<template v-if="index > 0">{{ FOOTER_LINK_SEPARATOR }}</template>
						<ELink :href="link.href" :style="footerLinkStyle">
							{{ link.label }}
						</ELink>
					</template>
				</template>
			</EText>
		</template>
	</template>
</template>
