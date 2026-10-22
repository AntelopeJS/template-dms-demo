<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { QuestionReply, QuestionRequestData } from "../types/question";
import { isTextTarget } from "../utils/approval-keyboard";
import { formatClock } from "../utils/format";

interface Props {
	request: QuestionRequestData;
	nowMs: number;
}

interface Emits {
	respond: [requestId: string, replies: QuestionReply[]];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const OTHER = -1;
const NONE = -2;
const ENTER_KEY = "Enter";

const page = ref(0);
const choices = ref<number[]>([]);
const customTexts = ref<string[]>([]);
const skipped = ref<boolean[]>([]);
const rootEl = ref<HTMLElement | null>(null);
const customEl = ref<HTMLTextAreaElement | null>(null);

const questions = computed(() => props.request.questions);
const total = computed(() => questions.value.length);
const current = computed(() => questions.value[page.value]);
const choice = computed(() => choices.value[page.value] ?? NONE);
const isLast = computed(() => page.value >= total.value - 1);

const countdown = computed<string>(() => {
	return formatClock(Math.max(0, props.request.expiresAtMs - props.nowMs));
});

const canAdvance = computed<boolean>(() => {
	if (choice.value === OTHER)
		return (customTexts.value[page.value] ?? "").trim() !== "";
	return choice.value !== NONE;
});

function reset(): void {
	page.value = 0;
	choices.value = questions.value.map(() => 0);
	customTexts.value = questions.value.map(() => "");
	skipped.value = questions.value.map(() => false);
	void nextTick(() => rootEl.value?.focus({ preventScroll: true }));
}

watch(() => props.request.requestId, reset, { immediate: true });

function setAt<T>(list: T[], index: number, value: T): T[] {
	const next = [...list];
	next[index] = value;
	return next;
}

function pick(index: number): void {
	choices.value = setAt(choices.value, page.value, index);
	skipped.value = setAt(skipped.value, page.value, false);
	if (index === OTHER) void nextTick(() => customEl.value?.focus());
}

function replyAt(index: number): QuestionReply {
	const picked = choices.value[index] ?? NONE;
	if (skipped.value[index] === true || picked === NONE)
		return { answer: "", isCustom: false, skipped: true };
	if (picked === OTHER)
		return {
			answer: (customTexts.value[index] ?? "").trim(),
			isCustom: true,
			skipped: false,
		};
	return {
		answer: questions.value[index]?.options[picked]?.label ?? "",
		isCustom: false,
		skipped: false,
	};
}

function finishOrNext(): void {
	if (!isLast.value) {
		page.value += 1;
		return;
	}
	emit(
		"respond",
		props.request.requestId,
		questions.value.map((_, index) => replyAt(index)),
	);
}

function next(): void {
	if (canAdvance.value) finishOrNext();
}

function skip(): void {
	skipped.value = setAt(skipped.value, page.value, true);
	finishOrNext();
}

function onKeydown(event: KeyboardEvent): void {
	if (isTextTarget(event.target)) {
		if (event.key === ENTER_KEY && !event.shiftKey) {
			event.preventDefault();
			next();
		}
		return;
	}
	if (event.metaKey || event.ctrlKey || event.altKey) return;
	if (event.key === ENTER_KEY) {
		event.preventDefault();
		next();
		return;
	}
	const index = Number.parseInt(event.key, 10) - 1;
	const optionCount = current.value?.options.length ?? 0;
	if (Number.isNaN(index) || index < 0 || index > optionCount) return;
	event.preventDefault();
	pick(index === optionCount ? OTHER : index);
}
</script>

<template>
	<div
		v-if="current"
		ref="rootEl"
		class="cb-ask"
		role="dialog"
		tabindex="-1"
		:aria-label="t('dms_ai.panel.questions.aria')"
		@keydown="onKeydown"
	>
		<div class="cb-ask__top">
			<span class="cb-ask__eyebrow">
				✦
				{{
					t("dms_ai.panel.questions.heading", {
						index: page + 1,
						total,
						header: current.header,
					})
				}}
			</span>
			<span v-if="countdown" class="cb-ask__timer">
				<UIcon name="i-ph-timer" />
				{{ countdown }}
			</span>
			<div v-if="total > 1" class="cb-ask__pages" role="tablist">
				<button
					v-for="(_, index) in questions"
					:key="index"
					type="button"
					role="tab"
					class="cb-ask__page"
					:class="{ 'is-active': index === page }"
					:aria-selected="index === page"
					@click="page = index"
				>
					{{ index + 1 }}
				</button>
			</div>
		</div>
		<div class="cb-ask__q">{{ current.question }}</div>
		<div class="cb-ask__opts" role="radiogroup">
			<button
				v-for="(option, index) in current.options"
				:key="option.label"
				type="button"
				role="radio"
				class="opt-card"
				:class="{ 'is-selected': choice === index }"
				:aria-checked="choice === index"
				@click="pick(index)"
			>
				<span class="opt-card__k">{{ index + 1 }}</span>
				<b>{{ option.label }}</b>
				<UBadge
					v-if="index === 0"
					size="sm"
					color="secondary"
					variant="subtle"
					:label="t('dms_ai.panel.questions.suggested')"
				/>
				<span v-if="option.description" class="opt-card__d">
					{{ option.description }}
				</span>
			</button>
			<button
				type="button"
				role="radio"
				class="opt-card"
				:class="{ 'is-selected': choice === OTHER }"
				:aria-checked="choice === OTHER"
				@click="pick(OTHER)"
			>
				<span class="opt-card__k">{{ current.options.length + 1 }}</span>
				<b>{{ t("dms_ai.panel.questions.other") }}</b>
				<span class="opt-card__d">
					{{ t("dms_ai.panel.questions.other_hint") }}
				</span>
			</button>
			<textarea
				v-if="choice === OTHER"
				ref="customEl"
				v-model="customTexts[page]"
				class="cb-ask__custom"
				rows="2"
				:placeholder="t('dms_ai.panel.questions.other_placeholder')"
			/>
		</div>
		<div class="cb-ask__foot">
			<UButton
				size="sm"
				color="neutral"
				variant="ghost"
				:label="t('dms_ai.panel.questions.skip')"
				@click="skip"
			/>
			<span class="cb-ask__spacer" />
			<span class="cb-ask__count">
				{{
					t("dms_ai.panel.questions.answer_count", { index: page + 1, total })
				}}
			</span>
			<UButton
				size="sm"
				color="secondary"
				:disabled="!canAdvance"
				@click="next"
			>
				{{
					t(
						isLast
							? "dms_ai.panel.questions.send"
							: "dms_ai.panel.questions.next",
					)
				}}
				<UKbd value="↵" size="sm" />
			</UButton>
		</div>
	</div>
</template>

<style scoped>
.cb-ask {
	display: grid;
	gap: 10px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--ui-border-muted);
	background: linear-gradient(180deg, var(--ai-tint), transparent 60%);
	outline: none;
}

.cb-ask:focus-visible {
	box-shadow: inset 0 0 0 2px var(--ai-line);
}

.cb-ask__top {
	display: flex;
	align-items: center;
	gap: 8px;
}

.cb-ask__eyebrow {
	flex: 1;
	min-width: 0;
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ai);
}

.cb-ask__timer {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font: 500 11px var(--ai-font-mono);
	color: var(--ui-text-muted);
}

.cb-ask__pages {
	display: inline-flex;
	padding: 2px;
	border-radius: 7px;
	background: var(--ui-bg-accented);
}

.cb-ask__page {
	min-width: 22px;
	height: 20px;
	border: 0;
	border-radius: 5px;
	background: transparent;
	color: var(--ui-text-muted);
	font: 600 11px var(--ai-font-mono);
	cursor: pointer;
}

.cb-ask__page.is-active {
	background: var(--dms-surface-card);
	color: var(--ui-text-highlighted);
	box-shadow: 0 0 0 1px var(--ui-border);
}

.cb-ask__q {
	font-size: 13.5px;
	font-weight: 600;
	line-height: 1.4;
	color: var(--ui-text-highlighted);
}

.cb-ask__opts {
	display: grid;
	gap: 6px;
}

.opt-card {
	display: grid;
	grid-template-columns: 18px minmax(0, 1fr) auto;
	align-items: start;
	gap: 2px 10px;
	width: 100%;
	padding: 9px 10px;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-surface-card);
	color: inherit;
	text-align: left;
	cursor: pointer;
}

.opt-card:hover {
	border-color: var(--ui-border-accented);
}

.opt-card.is-selected {
	border-color: var(--ai-line);
	background: var(--ai-tint);
	box-shadow: 0 0 0 3px var(--ai-tint);
}

.opt-card__k {
	display: grid;
	place-items: center;
	width: 18px;
	height: 18px;
	margin-top: 1px;
	border: 1px solid var(--ui-border-accented);
	border-radius: 5px;
	font: 600 10px var(--ai-font-mono);
	color: var(--ui-text-muted);
}

.opt-card.is-selected .opt-card__k {
	border-color: var(--ai);
	background: var(--ai);
	color: var(--ui-bg);
}

.opt-card b {
	font-size: 12.5px;
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.opt-card__d {
	grid-column: 2;
	font-size: 12px;
	line-height: 1.45;
	color: var(--ui-text-muted);
}

.cb-ask__custom {
	width: 100%;
	padding: 8px 10px;
	border: 1px solid var(--ai-line);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-bg-field);
	color: var(--ui-text-highlighted);
	font: inherit;
	font-size: 12.5px;
	resize: vertical;
	outline: none;
}

.cb-ask__foot {
	display: flex;
	align-items: center;
	gap: 6px;
}

.cb-ask__spacer {
	flex: 1;
}

.cb-ask__count {
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}
</style>
