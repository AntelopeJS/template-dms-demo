<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { ErrorMessage } from "../types/conversation";

interface Props {
	error: ErrorMessage;
	/** Retry is offered on the last error only, and not while a turn runs. */
	canRetry: boolean;
}

interface Emits {
	retry: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const COPIED_FOR_MS = 1_600;

const isCopied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const text = computed(() =>
	props.error.contentKey === undefined
		? props.error.content
		: t(props.error.contentKey),
);

const title = computed(() =>
	t(
		props.error.isLocal === true
			? "dms_ai.panel.errors.local_title"
			: "dms_ai.panel.errors.turn_title",
	),
);

async function copyDetails(): Promise<void> {
	const details = `${title.value} ${text.value}\n${new Date(props.error.timestampMs).toISOString()}`;
	try {
		await navigator.clipboard.writeText(details);
	} catch {
		return;
	}
	isCopied.value = true;
	if (copiedTimer !== null) clearTimeout(copiedTimer);
	copiedTimer = setTimeout(() => (isCopied.value = false), COPIED_FOR_MS);
}

onBeforeUnmount(() => {
	if (copiedTimer !== null) clearTimeout(copiedTimer);
});
</script>

<template>
	<div class="cb-error message-bubble-error" role="alert">
		<UIcon name="i-ph-warning-circle" class="cb-error__icon" />
		<div class="cb-error__body">
			<b>{{ title }}</b>
			<span class="error-text">{{ text }}</span>
			<div class="cb-error__row">
				<UButton
					v-if="canRetry && error.isRetryable"
					size="xs"
					color="neutral"
					variant="outline"
					icon="i-ph-arrows-clockwise"
					:label="t('dms_ai.panel.errors.retry_turn')"
					@click="emit('retry')"
				/>
				<UButton
					v-if="error.isLocal !== true"
					size="xs"
					color="neutral"
					variant="ghost"
					:icon="isCopied ? 'i-ph-check' : 'i-ph-copy'"
					:label="
						t(
							isCopied
								? 'dms_ai.common.copied'
								: 'dms_ai.panel.errors.copy_details',
						)
					"
					@click="copyDetails"
				/>
			</div>
		</div>
	</div>
</template>

<style scoped>
.cb-error {
	display: flex;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--dms-error-line);
	border-radius: var(--ai-radius-md);
	background: var(--dms-error-tint);
	font-size: 12.5px;
	line-height: 1.5;
	color: var(--ui-text-toned);
}

.cb-error__icon {
	width: 16px;
	height: 16px;
	flex: none;
	margin-top: 1px;
	color: var(--ui-error);
}

.cb-error__body {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.cb-error__body b {
	margin-right: 4px;
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.cb-error__row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
}

.cb-error__row:empty {
	display: none;
}
</style>
