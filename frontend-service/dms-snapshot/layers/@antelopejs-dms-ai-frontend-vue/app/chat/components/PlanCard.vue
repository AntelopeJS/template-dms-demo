<script setup lang="ts">
import { computed } from "vue";
import { PLAN_ARG_KEY } from "../constants/conversation";
import { useChatI18n } from "../composables/useChatI18n";
import type { ToolCallMessage } from "../types/conversation";
import MarkdownContent from "./MarkdownContent.vue";

interface Props {
	tool: ToolCallMessage;
	/** Only the latest plan of an idle chat can still be run. */
	canRun: boolean;
}

interface Emits {
	run: [];
	edit: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const LIST_ITEM = /^\s*(?:\d+[.)]|[-*+])\s+/;

const plan = computed<string>(() => {
	const args = props.tool.args;
	if (args === null || typeof args !== "object") return "";
	const value = Reflect.get(args, PLAN_ARG_KEY);
	return typeof value === "string" ? value : "";
});

const stepCount = computed(
	() => plan.value.split("\n").filter((line) => LIST_ITEM.test(line)).length,
);
</script>

<template>
	<article v-if="plan" class="cb-plan">
		<div class="cb-plan__head">
			<span class="cb-plan__eyebrow">
				{{
					stepCount > 0
						? t(
								"dms_ai.panel.plan.title_steps",
								{ count: stepCount },
								stepCount,
							)
						: t("dms_ai.panel.plan.title")
				}}
			</span>
			<span class="cb-plan__note">
				{{ t("dms_ai.panel.plan.nothing_changed") }}
			</span>
		</div>
		<MarkdownContent class="cb-plan__body cb-md" :content="plan" />
		<div v-if="canRun" class="cb-plan__foot">
			<UButton
				size="xs"
				color="neutral"
				variant="outline"
				:label="t('dms_ai.panel.plan.edit')"
				@click="emit('edit')"
			/>
			<UButton
				size="xs"
				color="secondary"
				icon="i-ph-play"
				:label="t('dms_ai.panel.plan.run')"
				@click="emit('run')"
			/>
		</div>
	</article>
</template>

<style scoped>
.cb-plan {
	border: 1px solid var(--ui-border-accented);
	border-radius: var(--ai-radius-md);
	background: var(--dms-surface-card);
	overflow: hidden;
}

.cb-plan__head {
	display: grid;
	gap: 3px;
	padding: 11px 12px 9px;
}

.cb-plan__eyebrow {
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ui-text-muted);
}

.cb-plan__note {
	font-size: 12px;
	color: var(--ui-text-dimmed);
}

.cb-plan__body {
	padding: 8px 12px 10px;
	border-top: 1px solid var(--ui-border-muted);
	font-size: 12.5px;
}

.cb-plan__foot {
	display: flex;
	justify-content: flex-end;
	gap: 6px;
	padding: 8px 10px 8px 12px;
	border-top: 1px solid var(--ui-border-muted);
	background: var(--dms-bg-muted);
}
</style>
