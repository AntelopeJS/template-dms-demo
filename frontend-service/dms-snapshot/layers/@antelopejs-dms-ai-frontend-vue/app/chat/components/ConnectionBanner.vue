<script setup lang="ts">
import { computed } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import {
	CONNECTION_STATUSES,
	type ConnectionStatus,
} from "../constants/protocol";

interface Props {
	status: ConnectionStatus;
	/** The sidecar itself is coming back up, not just the stream. */
	isReviving: boolean;
}

interface Emits {
	reconnect: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const LABEL_KEYS: Record<ConnectionStatus, string> = {
	[CONNECTION_STATUSES.CONNECTING]: "dms_ai.panel.connection.connecting",
	[CONNECTION_STATUSES.CONNECTED]: "",
	[CONNECTION_STATUSES.RECONNECTING]: "dms_ai.panel.connection.lost",
	[CONNECTION_STATUSES.DISCONNECTED]: "dms_ai.panel.connection.disconnected",
};

const labelKey = computed<string>(() =>
	props.isReviving
		? "dms_ai.panel.connection.reviving"
		: LABEL_KEYS[props.status],
);
</script>

<template>
	<div
		v-if="labelKey"
		class="cb-banner connection-banner"
		:data-status="status"
		role="status"
	>
		<UIcon name="i-ph-wifi-slash" class="cb-banner__icon" />
		<span class="cb-banner__text">{{ t(labelKey) }}</span>
		<UButton
			v-if="status !== 'connecting'"
			size="xs"
			color="neutral"
			variant="outline"
			:label="t('dms_ai.panel.connection.retry_now')"
			@click="emit('reconnect')"
		/>
	</div>
</template>

<style scoped>
.cb-banner {
	display: flex;
	flex: none;
	align-items: center;
	gap: 8px;
	padding: 8px 10px 8px 14px;
	border-bottom: 1px solid var(--dms-warning-line);
	background: var(--dms-warning-tint);
	font-size: 12.5px;
	color: var(--ui-text-toned);
}

.cb-banner__icon {
	width: 15px;
	height: 15px;
	flex: none;
	color: var(--ui-warning);
}

.cb-banner__text {
	flex: 1;
	min-width: 0;
}
</style>
