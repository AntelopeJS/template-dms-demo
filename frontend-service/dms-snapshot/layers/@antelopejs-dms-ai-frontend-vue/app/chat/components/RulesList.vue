<script setup lang="ts">
import { useChatI18n } from "../composables/useChatI18n";
import type { ActiveRule } from "../types/protocol";
import { ruleIcon } from "../utils/permission-view";

interface Props {
	rules: ActiveRule[];
}

interface Emits {
	revoke: [ruleId: string];
}

defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();
</script>

<template>
	<div class="cb-rules">
		<span class="cb-rules__title">{{ t("dms_ai.panel.rules.title") }}</span>
		<p v-if="rules.length === 0" class="cb-rules__empty">
			{{ t("dms_ai.panel.rules.empty") }}
		</p>
		<ul v-else class="cb-rules__list">
			<li v-for="rule in rules" :key="rule.id" class="cb-rules__item">
				<UIcon :name="ruleIcon(rule.kind)" class="cb-rules__icon" />
				<span class="cb-rules__label">
					{{
						rule.label ||
						t(`dms_ai.panel.rules.kind_${rule.kind}`, { value: rule.value })
					}}
				</span>
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					:label="t('dms_ai.panel.rules.revoke')"
					@click="emit('revoke', rule.id)"
				/>
			</li>
		</ul>
		<p class="cb-rules__note">{{ t("dms_ai.panel.rules.note") }}</p>
	</div>
</template>

<style scoped>
.cb-rules {
	display: grid;
	gap: 10px;
	width: 320px;
	max-width: 100%;
	padding: 12px;
}

.cb-rules__title {
	font: 600 10px var(--ai-font-mono, ui-monospace, monospace);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ui-text-muted);
}

.cb-rules__list {
	display: grid;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.cb-rules__item {
	display: flex;
	align-items: center;
	gap: 8px;
}

.cb-rules__icon {
	width: 15px;
	height: 15px;
	flex: none;
	color: var(--ui-text-muted);
}

.cb-rules__label {
	flex: 1;
	min-width: 0;
	font-size: 12.5px;
	overflow-wrap: anywhere;
}

.cb-rules__empty,
.cb-rules__note {
	margin: 0;
	font-size: 11.5px;
	color: var(--ui-text-dimmed);
}
</style>
