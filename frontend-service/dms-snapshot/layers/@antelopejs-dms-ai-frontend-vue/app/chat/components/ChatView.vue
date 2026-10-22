<script setup lang="ts">
import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
} from "vue";
import type { ChatTransport } from "../../runtime/chat-transport";
import type { PanelIntent, PanelIntents } from "../../runtime/panel-intents";
import {
	useChangeSetActions,
	type ChatApi,
} from "../composables/useChangeSetActions";
import { useChatChannel } from "../composables/useChatChannel";
import { useChatI18n } from "../composables/useChatI18n";
import { useConversation } from "../composables/useConversation";
import {
	persistConversationId,
	resolveConversationId,
} from "../composables/useConversationId";
import { useConversationList } from "../composables/useConversationList";
import { useConversationMode } from "../composables/useConversationMode";
import { usePermissionQueue } from "../composables/usePermissionQueue";
import { useQuestionQueue } from "../composables/useQuestionQueue";
import { useQueueActions } from "../composables/useQueueActions";
import { useRunClock } from "../composables/useRunClock";
import { useSettings } from "../composables/useSettings";
import { EXIT_PLAN_MODE_TOOL_NAME } from "../constants/conversation";
import {
	ACTIVITY_PAGE_PATH,
	CHANGE_SET_QUERY_KEY,
	CHANGES_PAGE_PATH,
	CLIENT_MESSAGE_TYPES,
	SERVER_EVENT_TYPES,
	SETTINGS_PAGE_PATH,
} from "../constants/protocol";
import type { ConversationSummary, CurrentPage } from "../types/conversation";
import type { ExpiredRequest } from "../types/permission";
import type { QuestionReply } from "../types/question";
import type { PendingAttachment } from "../utils/attachments";
import { formatClock, formatTokens } from "../utils/format";
import { newUuid } from "../utils/ids";
import { isRunStalled, runElapsedMs } from "../utils/run-status";
import { bareToolName } from "../utils/tool-lexicon";
import { latestTodos } from "../utils/todos";
import ApprovalDock from "./ApprovalDock.vue";
import ChatEmpty from "./ChatEmpty.vue";
import Composer from "./Composer.vue";
import ConnectionBanner from "./ConnectionBanner.vue";
import ConversationDrawer from "./ConversationDrawer.vue";
import FullAutoBanner from "./FullAutoBanner.vue";
import MessageList from "./MessageList.vue";
import PanelHeader, { type PanelStatusKind } from "./PanelHeader.vue";
import QuestionDock from "./QuestionDock.vue";
import QueueDock from "./QueueDock.vue";
import StepsDock from "./StepsDock.vue";

interface Props {
	/** The chat's side of the tab's stream, which the dashboard owns. */
	transport: ChatTransport;
	intents: PanelIntents;
	page: CurrentPage | null;
	/** The sidecar is coming back up: the transcript stays, under a banner. */
	isReviving: boolean;
	api: ChatApi | null;
}

interface Emits {
	close: [];
	navigate: [path: string];
}

interface FocusableComposer {
	focus: () => void;
	setDraft: (text: string) => void;
}

interface FocusableDock {
	focusRequest: (requestId: string) => void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const HISTORY_KEY = "j";
const ESCAPE_KEY = "Escape";
const SCROLL_STICKY_THRESHOLD_PX = 80;
const NAVIGATION_TARGETS: Record<string, string> = {
	changes: CHANGES_PAGE_PATH,
	activity: ACTIVITY_PAGE_PATH,
	settings: SETTINGS_PAGE_PATH,
};

const activeId = ref(resolveConversationId());
const channel = useChatChannel({
	transport: props.transport,
	getConversationId: () => activeId.value,
});
const queueOptions = {
	activeId,
	send: channel.send,
	onMessage: channel.onMessage,
};
const permissions = usePermissionQueue(queueOptions);
const questions = useQuestionQueue(queueOptions);
const conversation = useConversation({
	...queueOptions,
	getPagePath: () => props.page?.path,
});
const list = useConversationList({
	send: channel.send,
	onMessage: channel.onMessage,
});
const { settings } = useSettings({ onMessage: channel.onMessage });
const mode = useConversationMode({
	activeId,
	mode: conversation.mode,
	settings,
	send: channel.send,
});
const queueActions = useQueueActions({
	activeId,
	queued: conversation.queued,
	send: channel.send,
});
const changeSetActions = useChangeSetActions({
	activeId,
	changeSets: conversation.changeSets,
	send: channel.send,
	api: props.api,
});

const isDrawerOpen = ref(false);
const nowMs = useRunClock(computed(() => true));
const composerRef = ref<FocusableComposer | null>(null);
const approvalDockRef = ref<FocusableDock | null>(null);
const scrollEl = ref<HTMLElement | null>(null);

const isConnected = channel.isConnected;
const isRunning = conversation.isRunning;
const pendingCount = computed(
	() => permissions.queue.value.length + questions.queue.value.length,
);
const isStalled = computed(
	() =>
		conversation.isTurnInFlight.value &&
		isConnected.value &&
		isRunStalled(conversation.lastEventAtMs.value, nowMs.value),
);
const todos = computed(() => latestTodos(conversation.messages.value));
const agentName = computed(() =>
	t(`dms_ai.common.agent.${settings.value.provider}`),
);
const providerProblem = computed(
	() => settings.value.providers[settings.value.provider]?.available === false,
);

const title = computed(
	() =>
		list.conversations.value.find((item) => item.id === activeId.value)
			?.title || t("dms_ai.panel.new_conversation"),
);

const status = computed<PanelStatusKind>(() => {
	if (!isConnected.value)
		return channel.connectionStatus.value === "disconnected"
			? "offline"
			: "connecting";
	if (pendingCount.value > 0) return "waiting";
	return isRunning.value ? "working" : "ready";
});

const statusLabel = computed<string>(() => {
	const labels: Record<PanelStatusKind, () => string> = {
		ready: () => t("dms_ai.panel.status.ready"),
		working: () =>
			t("dms_ai.panel.status.working", {
				time: formatClock(
					runElapsedMs(conversation.progress.value, nowMs.value),
				),
			}),
		waiting: () =>
			t(
				"dms_ai.panel.status.waiting",
				{ count: pendingCount.value },
				pendingCount.value,
			),
		connecting: () => t("dms_ai.panel.status.connecting"),
		offline: () => t("dms_ai.panel.status.offline"),
	};
	const label = labels[status.value]();
	return status.value === "offline" ? label : `${label} · ${agentName.value}`;
});

const usageLabel = computed<string>(() => {
	if (!isConnected.value) return t("dms_ai.panel.composer.usage_offline");
	const tokens = conversation.totalTokens.value;
	if (tokens === null || tokens === 0) {
		return conversation.messages.value.length === 0
			? t("dms_ai.panel.composer.usage_new")
			: "";
	}
	return t("dms_ai.panel.composer.usage", { count: formatTokens(tokens) });
});

const placeholder = computed<string>(() => {
	if (!isConnected.value) return t("dms_ai.panel.composer.placeholder_offline");
	if (questions.queue.value.length > 0)
		return t("dms_ai.panel.composer.placeholder_question");
	if (isRunning.value) return t("dms_ai.panel.composer.placeholder_running");
	return t("dms_ai.panel.composer.placeholder_idle");
});

const isEmpty = computed(
	() => conversation.messages.value.length === 0 && !isRunning.value,
);

// Sent on the tab's stream itself: the chat's own channel is already closed
// when the panel unmounts it.
function leave(conversationId: string): void {
	props.transport.send({
		type: CLIENT_MESSAGE_TYPES.LEAVE_CONVERSATION,
		conversationId,
	});
}

function switchConversation(id: string): void {
	isDrawerOpen.value = false;
	if (id === activeId.value) return;
	leave(activeId.value);
	activeId.value = id;
	persistConversationId(id);
	conversation.reset();
	permissions.clear();
	questions.clear();
	channel.reidentify();
}

function newConversation(): void {
	switchConversation(newUuid());
}

function deleteConversation(item: ConversationSummary): void {
	if (item.isRunning === true)
		channel.send({
			type: CLIENT_MESSAGE_TYPES.INTERRUPT_TURN,
			conversationId: item.id,
		});
	list.remove(item);
	if (item.id === activeId.value) newConversation();
}

function openDrawer(): void {
	list.refresh();
	isDrawerOpen.value = true;
}

function navigate(path: string): void {
	emit("navigate", path);
}

function reviewChangeSet(changeSetId: string): void {
	const query = new URLSearchParams({ [CHANGE_SET_QUERY_KEY]: changeSetId });
	navigate(`${CHANGES_PAGE_PATH}?${query.toString()}`);
}

function submit(
	content: string,
	attachments: PendingAttachment[],
	includePage: boolean,
): void {
	conversation.sendUserMessage(
		content,
		attachments,
		includePage ? {} : { includePageContext: false },
	);
}

function answerQuestions(requestId: string, replies: QuestionReply[]): void {
	const records = questions.respond(requestId, replies);
	if (records !== null) conversation.recordAnswers(records);
}

function stopTurn(): void {
	conversation.interrupt();
}

function stopAutoFix(): void {
	channel.send({
		type: CLIENT_MESSAGE_TYPES.STOP_AUTOFIX,
		conversationId: activeId.value,
	});
}

function askAgain(summary: string): void {
	conversation.sendUserMessage(
		t("dms_ai.panel.approvals.ask_again_message", { summary }),
	);
}

function askAgainExpired(request: ExpiredRequest): void {
	permissions.dismissExpired(request.requestId);
	askAgain(request.summary);
}

function runPlan(): void {
	mode.setMode("normal");
	const planRequest = permissions.queue.value.find(
		(request) => bareToolName(request.toolName) === EXIT_PLAN_MODE_TOOL_NAME,
	);
	if (planRequest !== undefined) {
		permissions.respond(planRequest.requestId, { decision: "allow_once" });
		return;
	}
	conversation.sendUserMessage(t("dms_ai.panel.plan.go_ahead"));
}

function onConflictOpenChange(isOpen: boolean): void {
	if (!isOpen) changeSetActions.cancelUndo();
}

function setDraft(text: string): void {
	composerRef.value?.setDraft(text);
}

const INTENT_HANDLERS: Record<
	PanelIntent["kind"],
	(intent: PanelIntent) => void
> = {
	open: (intent) => {
		if (intent.kind === "open") switchConversation(intent.conversationId);
	},
	start: (intent) => {
		newConversation();
		if (intent.kind === "start" && intent.prompt)
			void nextTick(() => setDraft(intent.prompt ?? ""));
		else void nextTick(() => composerRef.value?.focus());
	},
	focus: () => void nextTick(() => composerRef.value?.focus()),
	approvals: () => {
		const first = permissions.queue.value[0];
		if (first !== undefined)
			approvalDockRef.value?.focusRequest(first.requestId);
		else openDrawer();
	},
};

watch(
	() => props.intents.pending.value,
	() => {
		const intent = props.intents.take();
		if (intent !== null) INTENT_HANDLERS[intent.kind](intent);
	},
	{ immediate: true },
);

function isHistoryCombo(event: KeyboardEvent): boolean {
	return (
		(event.metaKey || event.ctrlKey) &&
		!event.shiftKey &&
		event.key.toLowerCase() === HISTORY_KEY
	);
}

function onDocumentKeydown(event: KeyboardEvent): void {
	if (!isHistoryCombo(event)) return;
	event.preventDefault();
	if (isDrawerOpen.value) isDrawerOpen.value = false;
	else openDrawer();
}

function onPanelKeydown(event: KeyboardEvent): void {
	if (event.key !== ESCAPE_KEY || event.defaultPrevented) return;
	if (isDrawerOpen.value) {
		isDrawerOpen.value = false;
		return;
	}
	if (isRunning.value) stopTurn();
}

function refreshListAfterTurn(msg: unknown): void {
	if (!isDrawerOpen.value || msg === null || typeof msg !== "object") return;
	if (Reflect.get(msg, "type") === SERVER_EVENT_TYPES.RUN_DONE) list.refresh();
}

channel.onMessage(refreshListAfterTurn);

function isNearBottom(el: HTMLElement): boolean {
	return (
		el.scrollHeight - el.scrollTop - el.clientHeight <=
		SCROLL_STICKY_THRESHOLD_PX
	);
}

function scrollToBottom(): void {
	const el = scrollEl.value;
	if (el !== null) el.scrollTop = el.scrollHeight;
}

watch(
	() => [conversation.messages.value, isRunning.value],
	() => {
		const el = scrollEl.value;
		if (el === null || isNearBottom(el)) void nextTick(scrollToBottom);
	},
);

// The DMS mounts the panel open on a reload, often before the tab's stream
// is up: the list (and the chat's title) is asked for again once it is.
watch(isConnected, (connected) => {
	if (connected) list.refresh();
});

onMounted(() => {
	document.addEventListener("keydown", onDocumentKeydown);
	list.refresh();
	void nextTick(scrollToBottom);
});

// The DMS unmounts the panel's content when the panel closes: the chat is
// left then, which ends a Full auto granted until the chat closes.
onBeforeUnmount(() => {
	document.removeEventListener("keydown", onDocumentKeydown);
	leave(activeId.value);
});
</script>

<template>
	<main class="chat-view" @keydown="onPanelKeydown">
		<PanelHeader
			:title="title"
			:status="status"
			:status-label="statusLabel"
			:rules="permissions.rules.value"
			@history="openDrawer"
			@new-chat="newConversation"
			@close="emit('close')"
			@navigate="(target) => navigate(NAVIGATION_TARGETS[target])"
			@revoke-rule="permissions.revokeRule"
		/>

		<ConnectionBanner
			:status="channel.connectionStatus.value"
			:is-reviving="isReviving"
			@reconnect="channel.reconnect"
		/>
		<FullAutoBanner
			v-if="mode.current.value.fullAuto"
			:full-auto="mode.current.value.fullAuto"
			:now-ms="nowMs"
			@turn-off="mode.stopFullAuto"
		/>

		<section
			ref="scrollEl"
			class="chat-view-body"
			:class="{ 'is-dimmed': !isConnected }"
		>
			<ChatEmpty
				v-if="isEmpty"
				:page="page"
				:scope="mode.current.value.generationMode"
				@suggest="setDraft"
			/>
			<MessageList
				v-else
				:messages="conversation.messages.value"
				:change-sets="conversation.changeSets.value"
				:busy-change-set-ids="changeSetActions.busyIds.value"
				:requests="permissions.queue.value"
				:is-running="isRunning"
				:progress="conversation.progress.value"
				:now-ms="nowMs"
				:is-stalled="isStalled"
				:stalled-for-ms="nowMs - conversation.lastEventAtMs.value"
				@retry="conversation.retry"
				@reconnect="channel.reconnect"
				@stop="stopTurn"
				@focus-request="(id) => approvalDockRef?.focusRequest(id)"
				@undo="changeSetActions.undo"
				@redo="changeSetActions.redo"
				@review="reviewChangeSet"
				@stop-auto-fix="stopAutoFix"
				@ask-again="askAgain"
				@run-plan="runPlan"
				@edit-plan="setDraft(t('dms_ai.panel.plan.edit_prefix'))"
			/>
			<div v-if="providerProblem" class="chat-view-provider">
				<div class="cb-provider" role="alert">
					<UIcon name="i-ph-key" class="cb-provider__icon" />
					<div>
						<b>
							{{
								t("dms_ai.panel.errors.agent_cant_run", { agent: agentName })
							}}
						</b>
						{{ settings.providers[settings.provider]?.reason ?? "" }}
						{{ t("dms_ai.panel.errors.agent_no_fallback") }}
						<div class="cb-provider__row">
							<UButton
								size="xs"
								color="neutral"
								variant="outline"
								icon="i-ph-gear-six"
								:label="t('dms_ai.panel.errors.open_settings')"
								@click="navigate(SETTINGS_PAGE_PATH)"
							/>
						</div>
					</div>
				</div>
			</div>
		</section>

		<div class="cb__dock">
			<ApprovalDock
				ref="approvalDockRef"
				:requests="permissions.queue.value"
				:expired="permissions.expired.value"
				:rules="permissions.rules.value"
				:now-ms="nowMs"
				:timeout-minutes="settings.requestTimeoutMinutes"
				@answer="permissions.respond"
				@deny-all="permissions.denyAll"
				@revoke-rule="permissions.revokeRule"
				@ask-again="askAgainExpired"
				@dismiss-expired="permissions.dismissExpired"
			/>
			<QuestionDock
				v-if="questions.queue.value[0]"
				:request="questions.queue.value[0]"
				:now-ms="nowMs"
				@respond="answerQuestions"
			/>
			<StepsDock
				v-if="todos.length > 0"
				:todos="todos"
				:is-running="isRunning"
			/>
			<QueueDock
				v-if="conversation.queued.value.length > 0"
				:queue="conversation.queued.value"
				@cancel="queueActions.cancel"
				@update="queueActions.update"
				@move="queueActions.move"
				@clear="queueActions.clear"
			/>
			<Composer
				ref="composerRef"
				:is-disabled="!isConnected || providerProblem"
				:is-running="isRunning"
				:mode="mode.current.value"
				:builder-available="settings.builderAvailable"
				:page="page"
				:usage-label="usageLabel"
				:placeholder="placeholder"
				@submit="submit"
				@stop="stopTurn"
				@set-scope="mode.setScope"
				@set-mode="mode.setMode"
				@start-full-auto="mode.startFullAuto"
				@open-settings="navigate(SETTINGS_PAGE_PATH)"
			/>
		</div>

		<ConversationDrawer
			:open="isDrawerOpen"
			:conversations="list.conversations.value"
			:active-id="activeId"
			:now-ms="nowMs"
			@select="switchConversation"
			@delete="deleteConversation"
			@new="newConversation"
			@close="isDrawerOpen = false"
		/>

		<div v-if="list.pendingDelete.value" class="cb-toast" role="status">
			<UIcon name="i-ph-trash" class="cb-toast__icon" />
			<span class="cb-toast__text">
				{{
					t("dms_ai.panel.drawer.deleted", {
						title: list.pendingDelete.value.title,
					})
				}}
			</span>
			<UButton
				size="xs"
				color="neutral"
				variant="outline"
				:label="t('dms_ai.common.undo')"
				@click="list.undoRemove(list.pendingDelete.value.id)"
			/>
		</div>

		<UModal
			:open="changeSetActions.pendingUndo.value !== null"
			:title="t('dms_ai.panel.change.conflict_title')"
			@update:open="onConflictOpenChange"
		>
			<template #body>
				<p class="chat-view-conflict">
					{{
						t("dms_ai.panel.change.conflict_text", {
							number: changeSetActions.pendingUndo.value?.number ?? 0,
						})
					}}
				</p>
				<ul class="chat-view-conflicts">
					<li
						v-for="conflict in changeSetActions.pendingUndo.value?.conflicts ??
						[]"
						:key="conflict.changeSetId"
					>
						<b>#{{ conflict.number }}</b>
						{{ conflict.title }}
						<span>{{ conflict.files.join(", ") }}</span>
					</li>
				</ul>
			</template>
			<template #footer>
				<div class="chat-view-conflict-foot">
					<UButton
						color="neutral"
						variant="ghost"
						:label="t('dms_ai.panel.change.undo_only')"
						@click="changeSetActions.confirmUndo(false)"
					/>
					<UButton
						color="secondary"
						:label="t('dms_ai.panel.change.undo_together')"
						@click="changeSetActions.confirmUndo(true)"
					/>
				</div>
			</template>
		</UModal>
	</main>
</template>

<style scoped>
.chat-view-body {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-height: 0;
	overflow-y: auto;
	scrollbar-width: thin;
	transition: opacity 150ms;
}

.chat-view-body.is-dimmed {
	opacity: 0.6;
}

.cb__dock {
	flex: none;
	border-top: 1px solid var(--ui-border);
	background: var(--dms-bg-sidebar);
}

.chat-view-provider {
	padding: 0 14px 16px;
}

.cb-provider {
	display: flex;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--dms-error-line);
	border-radius: var(--ai-radius-md);
	background: var(--dms-error-tint);
	font-size: 12.5px;
	line-height: 1.5;
	color: var(--ui-text-toned);
}

.cb-provider__icon {
	width: 16px;
	height: 16px;
	flex: none;
	margin-top: 1px;
	color: var(--ui-error);
}

.cb-provider b {
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.cb-provider__row {
	margin-top: 8px;
}

.cb-toast {
	position: absolute;
	right: 12px;
	bottom: 12px;
	left: 12px;
	z-index: 7;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 10px 10px 12px;
	border: 1px solid var(--ui-border-accented);
	border-radius: var(--ai-radius-md);
	background: var(--ui-bg-elevated);
	box-shadow: var(--dms-shadow-pop);
	font-size: 12.5px;
}

.cb-toast__icon {
	width: 15px;
	height: 15px;
	flex: none;
	color: var(--ui-text-muted);
}

.cb-toast__text {
	flex: 1;
	min-width: 0;
}

.chat-view-conflict {
	margin: 0 0 10px;
	font-size: 13px;
	line-height: 1.5;
	color: var(--ui-text-muted);
}

.chat-view-conflicts {
	display: grid;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
	font-size: 12.5px;
}

.chat-view-conflicts span {
	display: block;
	font-family: var(--ai-font-mono, ui-monospace, monospace);
	font-size: 11px;
	color: var(--ui-text-muted);
	overflow-wrap: anywhere;
}

.chat-view-conflict-foot {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	width: 100%;
}
</style>

<style>
/*
 * The panel's tokens, aliases of the dashboard's: violet (Nuxt UI
 * `secondary`, tinted by the DMS's assistant tokens) is the AI colour,
 * everything else follows the DMS surfaces in light and dark alike. Shared
 * bits the panel's pieces draw are here too.
 */
.chat-view,
.dms-ai-chat-tokens {
	--ai: var(--ui-secondary);
	--ai-tint: var(--dms-assistant-tint);
	--ai-line: var(--dms-assistant-line);
	--ai-bg-hover: var(--ui-bg-elevated);
	--ai-radius-sm: 8px;
	--ai-radius-md: 10px;
	--ai-font-mono: var(
		--font-mono,
		ui-monospace,
		SFMono-Regular,
		Menlo,
		Monaco,
		Consolas,
		"Liberation Mono",
		monospace
	);
}

.chat-view {
	position: relative;
	display: flex;
	flex-direction: column;
	height: 100%;
	background: var(--dms-bg-sidebar, var(--ui-bg));
	color: var(--ui-text);
	font-size: 13px;
}

.chat-view .plus,
.dms-ai-chat-tokens .plus {
	color: var(--ui-success);
	font: 600 11.5px var(--ai-font-mono);
}

.chat-view .minus,
.dms-ai-chat-tokens .minus {
	color: var(--ui-error);
	font: 600 11.5px var(--ai-font-mono);
}

.chat-view .inline-code,
.dms-ai-chat-tokens .inline-code,
.chat-view .cb-md code,
.dms-ai-chat-tokens .cb-md code {
	padding: 1px 5px;
	border-radius: 4px;
	background: var(--ui-bg-accented);
	color: var(--ui-text-highlighted);
	font: 500 12px var(--ai-font-mono);
}

.chat-view .spin-ai,
.dms-ai-chat-tokens .spin-ai {
	display: inline-block;
	width: 12px;
	height: 12px;
	flex: none;
	border: 1.5px solid var(--ai);
	border-right-color: transparent;
	border-radius: 50%;
	animation: dms-ai-spin 0.8s linear infinite;
}

@keyframes dms-ai-spin {
	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.chat-view .spin-ai,
	.dms-ai-chat-tokens .spin-ai {
		animation-duration: 2.4s;
	}
}
</style>
