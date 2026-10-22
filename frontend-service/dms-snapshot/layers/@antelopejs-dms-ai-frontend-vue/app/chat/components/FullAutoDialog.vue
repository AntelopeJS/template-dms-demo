<script setup lang="ts">
import { computed, ref } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { FullAutoDuration } from "../types/protocol";

interface Emits {
	confirm: [duration: FullAutoDuration];
}

const emit = defineEmits<Emits>();
const open = defineModel<boolean>("open", { required: true });
const { t } = useChatI18n();

const DURATIONS: readonly FullAutoDuration[] = ["turn", "30m", "chat"];

const duration = ref<FullAutoDuration>("turn");
const items = computed(() =>
	DURATIONS.map((value) => ({
		value,
		label: t(`dms_ai.panel.full_auto.duration_${value}`),
	})),
);

function confirm(): void {
	emit("confirm", duration.value);
	open.value = false;
}
</script>

<template>
	<UModal v-model:open="open" :title="t('dms_ai.panel.full_auto.title')">
		<template #body>
			<div class="full-auto">
				<div class="full-auto__intro">
					<DmsIconWell icon="i-ph-lightning" tone="error" size="lg" />
					<p class="full-auto__text">
						{{ t("dms_ai.panel.full_auto.description") }}
					</p>
				</div>
				<span class="full-auto__label">
					{{ t("dms_ai.panel.full_auto.turn_off_after") }}
				</span>
				<DmsSegmented
					v-model="duration"
					:items="items"
					size="md"
					block
					:aria-label="t('dms_ai.panel.full_auto.turn_off_after')"
				/>
			</div>
		</template>
		<template #footer>
			<div class="full-auto__foot">
				<UButton
					color="neutral"
					variant="outline"
					:label="t('dms_ai.common.cancel')"
					@click="open = false"
				/>
				<UButton
					color="error"
					icon="i-ph-lightning"
					class="full-auto__confirm"
					:label="t('dms_ai.panel.full_auto.confirm')"
					@click="confirm"
				/>
			</div>
		</template>
	</UModal>
</template>

<style scoped>
.full-auto {
	display: grid;
	gap: 10px;
}

.full-auto__intro {
	display: flex;
	align-items: flex-start;
	gap: 12px;
}

.full-auto__text {
	margin: 0;
	font-size: 13px;
	line-height: 1.5;
	color: var(--ui-text-muted);
}

.full-auto__label {
	font-size: 12.5px;
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.full-auto__foot {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	width: 100%;
}
</style>
