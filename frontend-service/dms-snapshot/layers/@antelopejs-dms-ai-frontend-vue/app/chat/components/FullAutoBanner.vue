<script setup lang="ts">
import { computed } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { FullAutoState } from "../types/protocol";
import { formatClock } from "../utils/format";

interface Props {
	fullAuto: FullAutoState;
	nowMs: number;
}

interface Emits {
	turnOff: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const scope = computed<string>(() => {
	const { duration, untilMs } = props.fullAuto;
	if (duration === "30m" && untilMs !== undefined)
		return t("dms_ai.panel.full_auto.banner_until", {
			time: formatClock(Math.max(0, untilMs - props.nowMs)),
		});
	return t(`dms_ai.panel.full_auto.banner_${duration}`);
});
</script>

<template>
	<div class="cb-banner-auto" role="status">
		<UIcon name="i-ph-lightning" class="cb-banner-auto__icon" />
		<span class="cb-banner-auto__text">
			<b>{{ t("dms_ai.common.mode.auto") }}</b>
			· {{ scope }}
		</span>
		<UButton
			size="xs"
			color="neutral"
			variant="outline"
			:label="t('dms_ai.panel.full_auto.turn_off')"
			@click="emit('turnOff')"
		/>
	</div>
</template>

<style scoped>
.cb-banner-auto {
	display: flex;
	flex: none;
	align-items: center;
	gap: 8px;
	padding: 8px 10px 8px 14px;
	border-bottom: 1px solid var(--dms-error-line);
	background: var(--dms-error-tint);
	font-size: 12.5px;
	color: var(--ui-text-toned);
}

.cb-banner-auto__icon {
	width: 15px;
	height: 15px;
	flex: none;
	color: var(--ui-error);
}

.cb-banner-auto__text {
	flex: 1;
	min-width: 0;
}

.cb-banner-auto__text b {
	font-weight: 600;
	color: var(--ui-text-highlighted);
}
</style>
