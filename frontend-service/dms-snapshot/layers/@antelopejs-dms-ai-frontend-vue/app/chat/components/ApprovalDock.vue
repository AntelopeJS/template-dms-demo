<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type {
	ExpiredRequest,
	PermissionAnswer,
	PermissionRequestData,
} from "../types/permission";
import type { ActiveRule } from "../types/protocol";
import {
	approvalKeyAction,
	isTextTarget,
	stepIndex,
} from "../utils/approval-keyboard";
import { formatClock } from "../utils/format";
import { describeTool, toolVerb } from "../utils/tool-lexicon";
import PermissionCard from "./PermissionCard.vue";
import RulesList from "./RulesList.vue";

interface Props {
	requests: PermissionRequestData[];
	expired: ExpiredRequest[];
	rules: ActiveRule[];
	nowMs: number;
	timeoutMinutes: number;
}

interface Emits {
	answer: [requestId: string, answer: PermissionAnswer];
	denyAll: [];
	revokeRule: [ruleId: string];
	askAgain: [request: ExpiredRequest];
	dismissExpired: [requestId: string];
}

interface CardHandle {
	allow: () => void;
	deny: () => void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const rootEl = ref<HTMLElement | null>(null);
const focusedId = ref<string | null>(null);
const cards = new Map<string, CardHandle>();

const focusedIndex = computed(() => {
	const index = props.requests.findIndex(
		(req) => req.requestId === focusedId.value,
	);
	return index === -1 ? 0 : index;
});

const focused = computed(() => props.requests[focusedIndex.value] ?? null);

const countdown = computed<string>(() => {
	const expiresAt = focused.value?.expiresAtMs;
	if (expiresAt === undefined) return "";
	return formatClock(Math.max(0, expiresAt - props.nowMs));
});

const denyAllLabel = computed(() =>
	t(
		props.requests.length === 2
			? "dms_ai.panel.approvals.deny_both"
			: "dms_ai.panel.approvals.deny_all",
	),
);

function expiredVerb(request: ExpiredRequest): string {
	return toolVerb(describeTool(request.toolName, null), t);
}

function isTyping(): boolean {
	const active = document.activeElement;
	return (
		active instanceof HTMLTextAreaElement &&
		active.value.trim() !== "" &&
		rootEl.value?.contains(active) !== true
	);
}

async function takeFocus(): Promise<void> {
	await nextTick();
	if (isTyping()) return;
	rootEl.value?.focus({ preventScroll: true });
}

function focusRequest(requestId: string): void {
	focusedId.value = requestId;
	void takeFocus();
}

function move(step: number): void {
	const next = stepIndex(focusedIndex.value, step, props.requests.length);
	focusedId.value = props.requests[next]?.requestId ?? null;
}

function focusedCard(): CardHandle | undefined {
	const id = focused.value?.requestId;
	return id === undefined ? undefined : cards.get(id);
}

const KEY_ACTIONS = {
	allow: () => focusedCard()?.allow(),
	deny: () => focusedCard()?.deny(),
	next: () => move(1),
	previous: () => move(-1),
};

function onKeydown(event: KeyboardEvent): void {
	const action = approvalKeyAction({
		key: event.key,
		shiftKey: event.shiftKey,
		metaKey: event.metaKey,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
		isTextTarget: isTextTarget(event.target),
	});
	if (action === null) return;
	event.preventDefault();
	KEY_ACTIONS[action]();
}

function setCardRef(requestId: string, card: unknown): void {
	if (card === null) cards.delete(requestId);
	else cards.set(requestId, card as CardHandle);
}

watch(
	() => props.requests.map((req) => req.requestId),
	(ids, previous) => {
		if (focusedId.value === null || !ids.includes(focusedId.value))
			focusedId.value = ids[0] ?? null;
		const hasNew = ids.some((id) => !(previous ?? []).includes(id));
		if (hasNew) void takeFocus();
	},
	{ immediate: true },
);

defineExpose({ focusRequest });
</script>

<template>
	<div class="cb-approve-wrap">
		<div
			v-if="requests.length > 0"
			ref="rootEl"
			class="cb-approve"
			role="alertdialog"
			tabindex="-1"
			:aria-label="t('dms_ai.panel.approvals.aria')"
			@keydown="onKeydown"
		>
			<div class="cb-approve__head">
				<UIcon name="i-ph-hand-palm" class="cb-approve__icon" />
				<span class="cb-approve__eyebrow">
					{{
						t("dms_ai.panel.approvals.heading", {
							index: focusedIndex + 1,
							total: requests.length,
						})
					}}
				</span>
				<span
					v-if="countdown"
					class="cb-approve__timer"
					:title="
						t('dms_ai.panel.approvals.timer_hint', { minutes: timeoutMinutes })
					"
				>
					<UIcon name="i-ph-timer" />
					{{ t("dms_ai.panel.approvals.denies_in", { time: countdown }) }}
				</span>
			</div>
			<PermissionCard
				v-for="request in requests"
				:key="request.requestId"
				:ref="(card) => setCardRef(request.requestId, card)"
				:request="request"
				:is-focused="request.requestId === focused?.requestId"
				@focus="focusRequest(request.requestId)"
				@answer="(answer) => emit('answer', request.requestId, answer)"
			/>
			<div class="cb-approve__foot">
				<UButton
					v-if="requests.length > 1"
					size="xs"
					color="neutral"
					variant="ghost"
					icon="i-ph-prohibit"
					:label="denyAllLabel"
					@click="emit('denyAll')"
				/>
				<span v-else />
				<UPopover
					v-if="rules.length > 0"
					:content="{ side: 'top', align: 'end' }"
				>
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						icon="i-ph-key"
						:label="
							t(
								'dms_ai.panel.rules.count',
								{ count: rules.length },
								rules.length,
							)
						"
					/>
					<template #content>
						<RulesList
							:rules="rules"
							@revoke="(id) => emit('revokeRule', id)"
						/>
					</template>
				</UPopover>
			</div>
		</div>

		<div v-for="request in expired" :key="request.requestId" class="cb-expired">
			<span class="cb-expired__icon"><UIcon name="i-ph-timer" /></span>
			<div class="cb-expired__body">
				<div class="cb-expired__title">
					{{
						t("dms_ai.panel.approvals.expired_title", {
							tool: expiredVerb(request),
						})
					}}
				</div>
				<div class="cb-expired__sub">{{ request.summary }}</div>
				<p class="cb-expired__text">
					{{
						t("dms_ai.panel.approvals.expired_text", {
							minutes: timeoutMinutes,
						})
					}}
				</p>
				<div class="cb-expired__row">
					<UButton
						size="xs"
						color="neutral"
						variant="outline"
						icon="i-ph-arrows-clockwise"
						:label="t('dms_ai.panel.approvals.ask_again')"
						@click="emit('askAgain', request)"
					/>
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						:label="t('dms_ai.common.dismiss')"
						@click="emit('dismissExpired', request.requestId)"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.cb-approve-wrap:empty {
	display: none;
}

.cb-approve {
	display: grid;
	gap: 10px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--ui-border-muted);
	background: linear-gradient(180deg, var(--dms-warning-tint), transparent 60%);
	max-height: 62vh;
	overflow: auto;
	outline: none;
}

.cb-approve:focus-visible {
	box-shadow: inset 0 0 0 2px var(--dms-warning-line);
}

.cb-approve__head {
	display: flex;
	align-items: center;
	gap: 8px;
}

.cb-approve__icon {
	width: 15px;
	height: 15px;
	color: var(--ui-warning);
}

.cb-approve__eyebrow {
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ui-warning);
}

.cb-approve__timer {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-left: auto;
	font: 500 11px var(--ai-font-mono);
	color: var(--ui-text-muted);
}

.cb-approve__foot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.cb-expired {
	display: flex;
	gap: 10px;
	margin: 10px 14px 0;
	padding: 11px 12px;
	border: 1px solid var(--ui-border-accented);
	border-radius: var(--ai-radius-md);
	background: var(--ui-bg-elevated);
	opacity: 0.9;
}

.cb-expired__icon {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	flex: none;
	border-radius: var(--ai-radius-sm);
	background: var(--ui-bg-accented);
	color: var(--ui-text-muted);
}

.cb-expired__body {
	flex: 1;
	min-width: 0;
}

.cb-expired__title {
	font-size: 13px;
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.cb-expired__sub {
	margin-top: 2px;
	font: 450 11.5px var(--ai-font-mono);
	color: var(--ui-text-muted);
	overflow-wrap: anywhere;
}

.cb-expired__text {
	margin: 6px 0 0;
	font-size: 12.5px;
	color: var(--ui-text-muted);
}

.cb-expired__row {
	display: flex;
	gap: 6px;
	margin-top: 8px;
}
</style>
