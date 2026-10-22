<script setup lang="ts">
import { computed, ref } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { Notice } from "../types/protocol";
import { formatTimeOfDay } from "../utils/format";
import { describeTool, toolVerb } from "../utils/tool-lexicon";

interface Props {
	notice: Notice;
	/** Whether this auto-fix is the one running now, so it can be stopped. */
	canStopAutoFix: boolean;
}

interface Emits {
	stopAutoFix: [];
	askAgain: [summary: string];
}

interface NoticeLook {
	tone: string;
	icon: string;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t, locale } = useChatI18n();

const LOOKS: Record<Notice["kind"], NoticeLook> = {
	autofix: { tone: "warning", icon: "i-ph-wrench" },
	permission_expired: { tone: "neutral", icon: "i-ph-timer" },
	question_skipped: { tone: "neutral", icon: "i-ph-arrow-bend-down-right" },
	full_auto_ended: { tone: "neutral", icon: "i-ph-lightning-slash" },
};

const showErrors = ref(false);
const look = computed(() => LOOKS[props.notice.kind]);
const time = computed(() =>
	formatTimeOfDay(props.notice.timestampMs, locale.value),
);

const expiredTool = computed<string>(() => {
	if (props.notice.kind !== "permission_expired") return "";
	return toolVerb(describeTool(props.notice.toolName, null), t);
});
</script>

<template>
	<div class="cb-notice" :data-tone="look.tone" role="note">
		<UIcon :name="look.icon" class="cb-notice__icon" />
		<div class="cb-notice__body">
			<template v-if="notice.kind === 'autofix'">
				<b>
					{{
						t("dms_ai.panel.notice.autofix_title", {
							attempt: notice.attempt,
							max: notice.maxAttempts,
						})
					}}
				</b>
				{{ t("dms_ai.panel.notice.autofix_text") }}
				<ul v-if="showErrors" class="cb-notice__errors">
					<li v-for="(error, index) in notice.errors" :key="index">
						<code>{{ error }}</code>
					</li>
				</ul>
				<div class="cb-notice__row">
					<UButton
						v-if="canStopAutoFix"
						size="xs"
						color="neutral"
						variant="outline"
						:label="t('dms_ai.panel.notice.stop_autofix')"
						@click="emit('stopAutoFix')"
					/>
					<UButton
						v-if="notice.errors.length > 0"
						size="xs"
						color="neutral"
						variant="ghost"
						:label="
							t(
								showErrors
									? 'dms_ai.panel.notice.hide_errors'
									: 'dms_ai.panel.notice.show_errors',
								{ count: notice.errors.length },
								notice.errors.length,
							)
						"
						@click="showErrors = !showErrors"
					/>
				</div>
			</template>
			<template v-else-if="notice.kind === 'permission_expired'">
				<b>
					{{ t("dms_ai.panel.notice.expired_title", { tool: expiredTool }) }}
				</b>
				{{
					t("dms_ai.panel.notice.expired_text", {
						summary: notice.summary,
						time,
					})
				}}
				<div class="cb-notice__row">
					<UButton
						size="xs"
						color="neutral"
						variant="outline"
						icon="i-ph-arrows-clockwise"
						:label="t('dms_ai.panel.approvals.ask_again')"
						@click="emit('askAgain', notice.summary)"
					/>
				</div>
			</template>
			<template v-else-if="notice.kind === 'question_skipped'">
				{{
					t("dms_ai.panel.notice.question_skipped", { header: notice.header })
				}}
			</template>
			<template v-else>
				{{ t("dms_ai.panel.notice.full_auto_ended", { time }) }}
			</template>
		</div>
	</div>
</template>

<style scoped>
.cb-notice {
	--notice-color: var(--ui-text-muted);
	--notice-line: var(--ui-border);
	--notice-tint: var(--dms-surface-card);

	display: flex;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--notice-line);
	border-radius: var(--ai-radius-md);
	background: var(--notice-tint);
	font-size: 12.5px;
	line-height: 1.5;
	color: var(--ui-text-toned);
}

.cb-notice[data-tone="warning"] {
	--notice-color: var(--ui-warning);
	--notice-line: var(--dms-warning-line);
	--notice-tint: var(--dms-warning-tint);
}

.cb-notice[data-tone="error"] {
	--notice-color: var(--ui-error);
	--notice-line: var(--dms-error-line);
	--notice-tint: var(--dms-error-tint);
}

.cb-notice__icon {
	width: 16px;
	height: 16px;
	flex: none;
	margin-top: 1px;
	color: var(--notice-color);
}

.cb-notice__body {
	min-width: 0;
	flex: 1;
}

.cb-notice__body b {
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.cb-notice__row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
}

.cb-notice__row:empty {
	display: none;
}

.cb-notice__errors {
	margin: 8px 0 0;
	padding-left: 16px;
}

.cb-notice__errors code {
	font: 500 11.5px var(--ai-font-mono);
	overflow-wrap: anywhere;
}
</style>
