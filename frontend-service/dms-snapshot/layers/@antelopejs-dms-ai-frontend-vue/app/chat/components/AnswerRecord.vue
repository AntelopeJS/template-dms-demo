<script setup lang="ts">
import { useChatI18n } from "../composables/useChatI18n";
import type { QuestionAnswerRecord } from "../types/protocol";

interface Props {
	answers: QuestionAnswerRecord[];
}

defineProps<Props>();
const { t } = useChatI18n();
</script>

<template>
	<div class="cb-answers">
		<span class="cb-answers__who">
			✦ {{ t("dms_ai.panel.questions.asked") }}
		</span>
		<div class="cb-answers__card">
			<template v-for="(record, index) in answers" :key="index">
				<div class="cb-answers__q">{{ record.question }}</div>
				<div class="cb-answers__a">
					<template v-if="record.skipped">
						<UIcon name="i-ph-arrow-bend-down-right" />
						<span>{{ t("dms_ai.panel.questions.skipped_record") }}</span>
					</template>
					<template v-else-if="record.isCustom">
						<UIcon name="i-ph-chat-circle-dots" />
						<b>“{{ record.answer }}”</b>
						<UBadge
							size="sm"
							color="neutral"
							variant="subtle"
							:label="t('dms_ai.panel.questions.your_words')"
						/>
					</template>
					<template v-else>
						<UIcon name="i-ph-check" />
						<b>{{ record.answer }}</b>
					</template>
				</div>
			</template>
		</div>
	</div>
</template>

<style scoped>
.cb-answers {
	display: grid;
	gap: 8px;
}

.cb-answers__who {
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ai);
}

.cb-answers__card {
	display: grid;
	gap: 6px;
	padding: 10px 12px;
	border: 1px solid var(--ai-line);
	border-radius: var(--ai-radius-md);
	background: var(--ai-tint);
	font-size: 12.5px;
}

.cb-answers__q {
	font-size: 12px;
	color: var(--ui-text-muted);
}

.cb-answers__q:not(:first-child) {
	margin-top: 4px;
}

.cb-answers__a {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	color: var(--ui-text-toned);
}

.cb-answers__a :deep(svg),
.cb-answers__a .iconify {
	color: var(--ai);
}

.cb-answers__a b {
	font-weight: 600;
	color: var(--ui-text-highlighted);
}
</style>
