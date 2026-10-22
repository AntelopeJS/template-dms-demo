<script setup lang="ts">
import { computed } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type {
	ChangeSetFileStatus,
	ChangeSetSummary,
	TypecheckOutcome,
} from "../types/protocol";
import { formatTimeOfDay } from "../utils/format";

interface Props {
	changeSet: ChangeSetSummary;
	/** True while an undo or redo of this set is on its way. */
	isBusy?: boolean;
}

interface Emits {
	undo: [];
	redo: [];
	review: [];
}

interface TypecheckBadge {
	tone: string;
	icon: string;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t, locale } = useChatI18n();

const TYPECHECK_BADGES: Record<TypecheckOutcome, TypecheckBadge> = {
	passed: { tone: "success", icon: "i-ph-check" },
	failed: { tone: "error", icon: "i-ph-x" },
	skipped: { tone: "neutral", icon: "i-ph-minus" },
};

const FILE_ICONS: Record<ChangeSetFileStatus, string> = {
	added: "i-ph-file-plus",
	modified: "i-ph-file-code",
	deleted: "i-ph-file-minus",
};

const isUndone = computed(() => props.changeSet.state === "undone");
const badge = computed(() => TYPECHECK_BADGES[props.changeSet.typecheck]);
const fileCount = computed(() => props.changeSet.files.length);

const title = computed<string>(() => {
	const files = t(
		"dms_ai.panel.change.files",
		{ count: fileCount.value },
		fileCount.value,
	);
	const ops = props.changeSet.builderOps;
	if (ops === 0) return files;
	return `${files} · ${t("dms_ai.panel.change.builder_ops", { count: ops }, ops)}`;
});

const eyebrow = computed(() =>
	t(
		isUndone.value
			? "dms_ai.panel.change.undone"
			: "dms_ai.panel.change.applied",
		{
			number: props.changeSet.number,
		},
	),
);

const hint = computed<string>(() => {
	const { changeSet } = props;
	if (isUndone.value) {
		const at = formatTimeOfDay(
			changeSet.stateChangedAtMs ?? changeSet.createdAtMs,
			locale.value,
		);
		return changeSet.stateChangedBy
			? t("dms_ai.panel.change.undone_by", {
					time: at,
					name: changeSet.stateChangedBy,
				})
			: at;
	}
	const lines = changeSet.added + changeSet.removed;
	return t(
		"dms_ai.panel.change.hint",
		{
			time: formatTimeOfDay(changeSet.createdAtMs, locale.value),
			count: lines,
		},
		lines,
	);
});
</script>

<template>
	<article class="cb-change" :class="{ 'is-undone': isUndone }">
		<div class="cb-change__head">
			<div class="cb-change__titles">
				<span class="cb-change__eyebrow">
					<template v-if="!isUndone">✦</template>
					{{ eyebrow }}
				</span>
				<div class="cb-change__title">{{ title }}</div>
				<div
					v-if="changeSet.isAutoFix || changeSet.overlapped"
					class="cb-change__flags"
				>
					<span v-if="changeSet.isAutoFix">
						<UIcon name="i-ph-wrench" />
						{{ t("dms_ai.panel.change.autofix") }}
					</span>
					<span v-if="changeSet.overlapped" class="is-warning">
						<UIcon name="i-ph-warning" />
						{{ t("dms_ai.panel.change.overlapped") }}
					</span>
				</div>
			</div>
			<DmsStatusPill
				v-if="!isUndone"
				:tone="badge.tone"
				:icon="badge.icon"
				:label="t(`dms_ai.panel.change.typecheck.${changeSet.typecheck}`)"
				size="sm"
				:mono="false"
			/>
		</div>
		<div
			v-if="!isUndone && changeSet.files.length > 0"
			class="cb-change__files"
		>
			<div v-for="file in changeSet.files" :key="file.path" class="cb-file">
				<UIcon :name="FILE_ICONS[file.status]" class="cb-file__icon" />
				<span class="cb-file__path" :title="file.path">{{ file.path }}</span>
				<span v-if="file.status !== 'modified'" class="cb-file__kind">
					{{ t(`dms_ai.panel.change.status.${file.status}`) }}
				</span>
				<span v-if="file.added > 0" class="plus">+{{ file.added }}</span>
				<span v-if="file.removed > 0" class="minus">−{{ file.removed }}</span>
			</div>
		</div>
		<div class="cb-change__foot">
			<span class="cb-change__hint">{{ hint }}</span>
			<UButton
				v-if="isUndone"
				size="xs"
				color="neutral"
				variant="outline"
				icon="i-ph-arrow-clockwise"
				:loading="isBusy"
				:label="t('dms_ai.panel.change.redo')"
				@click="emit('redo')"
			/>
			<template v-else>
				<UButton
					size="xs"
					color="neutral"
					variant="outline"
					icon="i-ph-arrow-counter-clockwise"
					:loading="isBusy"
					:label="t('dms_ai.panel.change.undo')"
					@click="emit('undo')"
				/>
				<UButton
					size="xs"
					color="secondary"
					icon="i-ph-git-diff"
					:label="t('dms_ai.panel.change.review')"
					@click="emit('review')"
				/>
			</template>
		</div>
	</article>
</template>

<style scoped>
.cb-change {
	border: 1px solid var(--ai-line);
	border-radius: var(--ai-radius-md);
	background:
		linear-gradient(180deg, var(--ai-tint), transparent 70%),
		var(--dms-surface-card);
	overflow: hidden;
}

.cb-change__head {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 11px 12px 9px;
}

.cb-change__titles {
	flex: 1;
	min-width: 0;
}

.cb-change__eyebrow {
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ai);
}

.cb-change__title {
	margin-top: 3px;
	font-size: 13px;
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.cb-change__flags {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 12px;
	margin-top: 4px;
	font-size: 11.5px;
	color: var(--ui-text-muted);
}

.cb-change__flags span {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.cb-change__flags .is-warning {
	color: var(--ui-warning);
}

.cb-change__files {
	padding: 4px 0;
	border-top: 1px solid var(--ui-border-muted);
}

.cb-file {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 26px;
	padding: 0 12px;
	font: 450 11.5px var(--ai-font-mono);
	color: var(--ui-text-toned);
}

.cb-file__icon {
	width: 14px;
	height: 14px;
	flex: none;
	color: var(--ui-text-muted);
}

.cb-file__path {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cb-file__kind {
	font: 600 9.5px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ui-text-dimmed);
}

.cb-change__foot {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 10px 8px 12px;
	border-top: 1px solid var(--ui-border-muted);
	background: var(--dms-bg-muted);
}

.cb-change__hint {
	margin-right: auto;
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.cb-change.is-undone {
	border-color: var(--ui-border);
	background: var(--dms-surface-card);
}

.cb-change.is-undone .cb-change__eyebrow {
	color: var(--ui-text-muted);
}

.cb-change.is-undone .cb-change__title {
	color: var(--ui-text-muted);
	text-decoration: line-through;
	text-decoration-color: var(--ui-text-dimmed);
}
</style>
