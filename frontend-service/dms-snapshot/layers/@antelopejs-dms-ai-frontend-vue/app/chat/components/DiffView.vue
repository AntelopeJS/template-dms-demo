<script setup lang="ts">
import { computed, ref } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { DiffHunk } from "../types/protocol";
import { diffRows, limitRows } from "../utils/diff";

interface Props {
	hunks: DiffHunk[];
	/** Rows shown before "Show all". */
	limit?: number;
}

const props = withDefaults(defineProps<Props>(), { limit: 40 });
const { t } = useChatI18n();

const isFull = ref(false);
const rows = computed(() => diffRows(props.hunks));
const shown = computed(() =>
	isFull.value
		? { rows: rows.value, hidden: 0 }
		: limitRows(rows.value, props.limit),
);
</script>

<template>
	<div class="diff">
		<div class="diff__lines">
			<div
				v-for="row in shown.rows"
				:key="row.key"
				class="ln"
				:class="`is-${row.kind}`"
			>
				<span class="ln__num">{{ row.number }}</span>
				<span class="ln__sign">{{ row.sign }}</span>
				<span class="ln__text">{{ row.text }}</span>
			</div>
		</div>
		<button
			v-if="shown.hidden > 0"
			type="button"
			class="diff__more"
			@click="isFull = true"
		>
			{{
				t(
					"dms_ai.panel.approvals.show_all_lines",
					{ count: shown.hidden },
					shown.hidden,
				)
			}}
		</button>
	</div>
</template>

<style scoped>
.diff {
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-bg-field);
	overflow: hidden;
	font: 450 11.5px / 1.65 var(--ai-font-mono);
}

.diff__lines {
	max-height: 280px;
	padding: 4px 0;
	overflow: auto;
}

.ln {
	display: grid;
	grid-template-columns: 34px 14px minmax(0, 1fr);
	min-width: max-content;
	white-space: pre;
	color: var(--ui-text-toned);
}

.ln__num {
	padding-right: 6px;
	text-align: right;
	color: var(--ui-text-dimmed);
	user-select: none;
}

.ln__sign {
	text-align: center;
	color: var(--ui-text-dimmed);
	user-select: none;
}

.ln.is-add {
	background: var(--dms-success-tint);
	box-shadow: inset 2px 0 0 var(--ui-success);
}

.ln.is-add .ln__sign {
	color: var(--ui-success);
}

.ln.is-remove {
	background: var(--dms-error-tint);
	box-shadow: inset 2px 0 0 var(--ui-error);
}

.ln.is-remove .ln__sign {
	color: var(--ui-error);
}

.ln.is-hunk {
	color: var(--ui-text-dimmed);
	background: color-mix(in srgb, var(--dms-accent-tint) 50%, transparent);
}

.diff__more {
	display: block;
	width: 100%;
	padding: 5px 10px;
	border: 0;
	border-top: 1px solid var(--ui-border);
	background: var(--dms-bg-muted);
	color: var(--ui-text-muted);
	font: 500 11px var(--ai-font-mono);
	text-align: left;
	cursor: pointer;
}

.diff__more:hover {
	color: var(--ui-text-highlighted);
}
</style>
