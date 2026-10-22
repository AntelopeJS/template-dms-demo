<script setup lang="ts">
import EmailLayout from '#dms-layout/app/emails/components/EmailLayout.vue'
import MailingBlocks from './components/MailingBlocks.vue'
import type { ResolvedEmail } from '../types/mailing'

interface Props {
	locale: string
	email: ResolvedEmail
}

const VIEWPORT = 'width=device-width, initial-scale=1'

// The DMS frame without its heading and separator: the blocks carry the
// e-mail's own title and footer. The logo is left out unless a mail client can
// load it (`publicLogoOnly`).
defineProps<Props>()
</script>

<template>
	<EmailLayout
		:lang="locale"
		:preheader="email.preheader"
		:divider="false"
		logo-alt=""
		public-logo-only
	>
		<template #head>
			<meta name="viewport" :content="VIEWPORT" />
			<title>{{ email.subject }}</title>
		</template>
		<MailingBlocks :blocks="email.blocks" />
		<template #footer>
			<MailingBlocks :blocks="email.blocks" footer-only />
		</template>
	</EmailLayout>
</template>
