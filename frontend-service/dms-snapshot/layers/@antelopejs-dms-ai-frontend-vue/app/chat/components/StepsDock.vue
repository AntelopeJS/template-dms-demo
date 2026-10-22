<script setup lang="ts">
import { computed, ref } from "vue";
import { TODO_STATUS } from "../constants/conversation";
import { useChatI18n } from "../composables/useChatI18n";
import type { TodoItem } from "../utils/todos";

interface Props {
	todos: TodoItem[];
	isRunning: boolean;
}

const props = defineProps<Props>();
const { t } = useChatI18n();

const PERCENT = 100;

const isOpen = ref(true);

const doneCount = computed(
	() =>
		props.todos.filter((todo) => todo.status === TODO_STATUS.COMPLETED).length,
);
const active = computed(() =>
	props.todos.find((todo) => todo.status === TODO_STATUS.IN_PROGRESS),
);
const progress = computed(() =>
	props.todos.length === 0
		? 0
		: Math.round((doneCount.value / props.todos.length) * PERCENT),
);
const currentLabel = computed(() => active.value?.activeForm ?? "");
</script>

<template>
	<section class="cb-steps" :aria-label="t('dms_ai.panel.steps.title')">
		<button
			type="button"
			class="cb-steps__head"
			:aria-expanded="isOpen"
			@click="isOpen = !isOpen"
		>
			<UIcon name="i-ph-list-checks" class="cb-steps__icon" />
			<b>{{ t("dms_ai.panel.steps.title") }}</b>
			<span class="cb-steps__current">{{ currentLabel }}</span>
			<span class="cb-steps__num">{{ doneCount }}/{{ todos.length }}</span>
			<UIcon
				:name="isOpen ? 'i-ph-caret-down' : 'i-ph-caret-up'"
				class="cb-steps__caret"
			/>
		</button>
		<div class="cb-steps__bar"><span :style="{ width: `${progress}%` }" /></div>
		<ol v-if="isOpen" class="cb-steps__list">
			<li
				v-for="(todo, index) in todos"
				:key="index"
				class="cb-step"
				:class="{
					'is-done': todo.status === 'completed',
					'is-active': todo.status === 'in_progress',
				}"
			>
				<UIcon v-if="todo.status === 'completed'" name="i-ph-check-circle" />
				<span
					v-else-if="todo.status === 'in_progress' && isRunning"
					class="spin-ai"
				/>
				<span v-else class="cb-step__ring" />
				{{ todo.status === "in_progress" ? todo.activeForm : todo.content }}
			</li>
		</ol>
	</section>
</template>

<style scoped>
.cb-steps {
	padding: 10px 14px 8px;
	border-bottom: 1px solid var(--ui-border-muted);
}

.cb-steps__head {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 0;
	border: 0;
	background: transparent;
	color: inherit;
	font-size: 12.5px;
	text-align: left;
	cursor: pointer;
}

.cb-steps__icon {
	width: 15px;
	height: 15px;
	color: var(--ai);
}

.cb-steps__head b {
	font-weight: 600;
}

.cb-steps__current {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--ui-text-muted);
}

.cb-steps__num {
	font: 500 11px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.cb-steps__caret {
	width: 13px;
	height: 13px;
	color: var(--ui-text-dimmed);
}

.cb-steps__bar {
	height: 3px;
	margin: 8px 0 6px;
	border-radius: 3px;
	background: var(--ui-bg-accented);
	overflow: hidden;
}

.cb-steps__bar span {
	display: block;
	height: 100%;
	background: var(--ai);
	transition: width 240ms ease;
}

.cb-steps__list {
	max-height: 132px;
	margin: 0;
	padding: 0;
	overflow: auto;
	list-style: none;
}

.cb-step {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 24px;
	font-size: 12.5px;
	color: var(--ui-text-toned);
}

.cb-step > :first-child {
	flex: none;
}

.cb-step.is-done {
	color: var(--ui-text-dimmed);
	text-decoration: line-through;
	text-decoration-color: var(--ui-border-accented);
}

.cb-step.is-done > :first-child {
	color: var(--ui-success);
}

.cb-step.is-active {
	font-weight: 550;
	color: var(--ui-text-highlighted);
}

.cb-step__ring {
	width: 12px;
	height: 12px;
	border: 1.5px solid var(--ui-border-accented);
	border-radius: 50%;
}
</style>
