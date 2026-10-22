<script setup lang="ts">
import { computed } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { ActiveRule } from "../types/protocol";
import { ruleIcon } from "../utils/permission-view";
import { shortcutLabel } from "../utils/platform";

export type PanelStatusKind =
	| "ready"
	| "working"
	| "waiting"
	| "connecting"
	| "offline";

interface Props {
	title: string;
	status: PanelStatusKind;
	/** "Working · 0:14 · Claude Code". */
	statusLabel: string;
	rules: ActiveRule[];
}

interface Emits {
	history: [];
	newChat: [];
	close: [];
	navigate: [target: "changes" | "activity" | "settings"];
	revokeRule: [ruleId: string];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const HISTORY_KEY = "j";
const TOGGLE_KEY = "k";

const historyTitle = computed(
	() => `${t("dms_ai.panel.header.history")} · ${shortcutLabel(HISTORY_KEY)}`,
);
const closeTitle = computed(
	() =>
		`${t("dms_ai.panel.header.close")} · ${shortcutLabel(TOGGLE_KEY, true)}`,
);

const moreItems = computed(() => [
	[
		{
			label: t(
				"dms_ai.panel.rules.count",
				{ count: props.rules.length },
				props.rules.length,
			),
			icon: "i-ph-key",
			disabled: props.rules.length === 0,
			children: [
				[
					{
						type: "label" as const,
						label: t("dms_ai.panel.rules.select_to_revoke"),
					},
				],
				props.rules.map((rule) => ({
					label: rule.label || rule.value,
					icon: ruleIcon(rule.kind),
					onSelect: () => emit("revokeRule", rule.id),
				})),
			],
		},
	],
	[
		{
			label: t("dms_ai.panel.header.open_changes"),
			icon: "i-ph-git-diff",
			onSelect: () => emit("navigate", "changes"),
		},
		{
			label: t("dms_ai.panel.header.open_activity"),
			icon: "i-ph-clock-counter-clockwise",
			onSelect: () => emit("navigate", "activity"),
		},
		{
			label: t("dms_ai.panel.header.settings"),
			icon: "i-ph-gear-six",
			onSelect: () => emit("navigate", "settings"),
		},
	],
]);
</script>

<template>
	<header class="cb__head chat-view-header">
		<span class="ai-tile" aria-hidden="true">
			<UIcon name="i-ph-sparkle" />
		</span>
		<div class="cb__title">
			<b>{{ title }}</b>
			<span class="cb__status" :data-status="status" aria-live="polite">
				<span class="cb__dot" />
				{{ statusLabel }}
			</span>
		</div>
		<div class="cb__head-actions">
			<UButton
				size="sm"
				color="neutral"
				variant="ghost"
				square
				icon="i-ph-list-bullets"
				:aria-label="t('dms_ai.panel.header.history')"
				:title="historyTitle"
				@click="emit('history')"
			/>
			<UButton
				size="sm"
				color="neutral"
				variant="ghost"
				square
				icon="i-ph-note-pencil"
				:aria-label="t('dms_ai.panel.header.new_chat')"
				:title="t('dms_ai.panel.header.new_chat')"
				@click="emit('newChat')"
			/>
			<UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
				<UButton
					size="sm"
					color="neutral"
					variant="ghost"
					square
					icon="i-ph-dots-three"
					:aria-label="t('dms_ai.panel.header.more')"
					:title="t('dms_ai.panel.header.more')"
				/>
			</UDropdownMenu>
			<UButton
				size="sm"
				color="neutral"
				variant="ghost"
				square
				icon="i-ph-x"
				:aria-label="t('dms_ai.panel.header.close')"
				:title="closeTitle"
				@click="emit('close')"
			/>
		</div>
	</header>
</template>

<style scoped>
.cb__head {
	display: flex;
	flex: none;
	align-items: center;
	gap: 10px;
	height: 52px;
	padding: 0 8px 0 14px;
	border-bottom: 1px solid var(--ui-border);
}

.ai-tile {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	flex: none;
	border-radius: var(--ai-radius-sm);
	background: var(--ai-tint);
	box-shadow: inset 0 0 0 1px var(--ai-line);
	color: var(--ai);
	font-size: 15px;
}

.cb__title {
	flex: 1;
	min-width: 0;
}

.cb__title b {
	display: block;
	overflow: hidden;
	font-size: 13px;
	font-weight: 650;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--ui-text-highlighted);
}

.cb__status {
	display: flex;
	align-items: center;
	gap: 6px;
	overflow: hidden;
	font: 500 10.5px var(--ai-font-mono);
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--ui-text-muted);
}

.cb__dot {
	width: 6px;
	height: 6px;
	flex: none;
	border-radius: 50%;
	background: var(--ui-success);
	box-shadow: 0 0 6px var(--ui-success);
}

.cb__status[data-status="working"] .cb__dot {
	background: var(--ai);
	box-shadow: 0 0 6px var(--ai);
	animation: dms-ai-pulse 1.2s ease-in-out infinite;
}

.cb__status[data-status="waiting"] .cb__dot,
.cb__status[data-status="connecting"] .cb__dot {
	background: var(--ui-warning);
	box-shadow: 0 0 6px var(--ui-warning);
}

.cb__status[data-status="offline"] .cb__dot {
	background: var(--ui-error);
	box-shadow: none;
}

.cb__head-actions {
	display: flex;
	align-items: center;
	gap: 1px;
}

@keyframes dms-ai-pulse {
	50% {
		opacity: 0.35;
	}
}

@media (prefers-reduced-motion: reduce) {
	.cb__status[data-status="working"] .cb__dot {
		animation: none;
	}
}
</style>
