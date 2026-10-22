<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted } from "vue";
import MessageList from "../chat/components/MessageList.vue";
import { useChatI18n } from "../chat/composables/useChatI18n";
import { usePaletteTurn } from "../chat/composables/usePaletteTurn";
import { useRunClock } from "../chat/composables/useRunClock";
import { MESSAGE_ROLES } from "../chat/constants/conversation";
import { isRunStalled } from "../chat/utils/run-status";
import {
	ASSISTANT_SESSION_KEY,
	type AssistantSession,
} from "../runtime/assistant-session";

interface Props {
	/** The question the palette submitted, trimmed. */
	prompt: string;
	/** Closes the palette. */
	close: () => void;
}

const props = defineProps<Props>();
// A read-only answer changes no file: no change set is ever being undone.
const NO_BUSY_CHANGE_SETS: ReadonlySet<string> = new Set();
const { t } = useChatI18n();
const sessionRef = inject(ASSISTANT_SESSION_KEY, null);
// Read once: a palette answer belongs to the session it was asked in.
const session: AssistantSession | null = sessionRef?.value ?? null;

const turn =
	session === null
		? null
		: usePaletteTurn({
				transport: session.chat,
				prompt: props.prompt,
				getPagePath: () => session.currentPage.value?.path,
			});
const releaseStream = session?.holdStream() ?? (() => undefined);

const isRunning = computed(() => turn?.conversation.isRunning.value === true);
const nowMs = useRunClock(isRunning);
const answer = computed(
	() =>
		turn?.conversation.messages.value.filter(
			(message) => message.role !== MESSAGE_ROLES.USER,
		) ?? [],
);
const isStalled = computed(
	() =>
		turn !== null &&
		turn.conversation.isTurnInFlight.value &&
		turn.channel.isConnected.value &&
		isRunStalled(turn.conversation.lastEventAtMs.value, nowMs.value),
);
const isWaiting = computed(() => turn?.isWaitingForUser.value === true);
const isStarting = computed(
	() => turn !== null && answer.value.length === 0 && !isWaiting.value,
);

function continueInAssistant(): void {
	if (session === null || turn === null) return;
	turn.handOff();
	props.close();
	session.openConversation(turn.conversationId);
}

onMounted(() => turn?.start());

onBeforeUnmount(() => {
	turn?.stop();
	releaseStream();
});
</script>

<template>
	<div class="dms-ai-palette-answer dms-ai-chat-tokens">
		<p v-if="turn === null" class="dms-ai-palette-answer__note">
			{{ t("dms_ai.panel.palette.answer.not_running") }}
		</p>
		<template v-else>
			<p class="dms-ai-palette-answer__mode">
				<UIcon name="i-ph-eye" />
				{{ t("dms_ai.panel.palette.answer.read_only") }}
			</p>
			<p
				v-if="isStarting"
				class="dms-ai-palette-answer__progress"
				role="status"
			>
				<span class="spin-ai" />
				{{
					turn.channel.isConnected.value
						? t("dms_ai.panel.palette.answer.thinking")
						: t("dms_ai.panel.status.connecting")
				}}
			</p>
			<MessageList
				v-else
				class="dms-ai-palette-answer__stream"
				:messages="answer"
				:change-sets="turn.conversation.changeSets.value"
				:busy-change-set-ids="NO_BUSY_CHANGE_SETS"
				:requests="turn.permissions.queue.value"
				:is-running="isRunning"
				:progress="turn.conversation.progress.value"
				:now-ms="nowMs"
				:is-stalled="isStalled"
				:stalled-for-ms="nowMs - turn.conversation.lastEventAtMs.value"
				@retry="turn.conversation.retry"
				@reconnect="turn.channel.reconnect"
				@stop="turn.conversation.interrupt"
				@focus-request="continueInAssistant"
				@run-plan="continueInAssistant"
				@edit-plan="continueInAssistant"
			/>
			<p v-if="isWaiting" class="dms-ai-palette-answer__waiting" role="alert">
				<UIcon name="i-ph-hand-palm" />
				{{ t("dms_ai.panel.palette.answer.waiting") }}
			</p>
		</template>
		<div class="dms-ai-palette-answer__actions">
			<UButton
				v-if="turn !== null"
				size="sm"
				color="secondary"
				:variant="isWaiting ? 'solid' : 'soft'"
				icon="i-ph-sidebar-simple"
				:label="t('dms_ai.panel.palette.answer.continue')"
				@click="continueInAssistant"
			/>
			<UButton
				size="sm"
				color="neutral"
				variant="ghost"
				:label="t('dms_ai.panel.palette.answer.close')"
				@click="props.close()"
			/>
		</div>
	</div>
</template>

<style scoped>
.dms-ai-palette-answer {
	display: flex;
	flex-direction: column;
	gap: 10px;
	font-size: 13px;
}

.dms-ai-palette-answer__mode,
.dms-ai-palette-answer__progress,
.dms-ai-palette-answer__waiting {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 0;
	font-size: 12px;
	color: var(--ui-text-muted);
}

.dms-ai-palette-answer__waiting {
	color: var(--ui-warning);
	font-weight: 500;
}

.dms-ai-palette-answer__stream {
	max-height: min(46vh, 420px);
	overflow-y: auto;
}

/* The palette's frame already names the assistant. */
.dms-ai-palette-answer__stream :deep(.cb-who) {
	display: none;
}

.dms-ai-palette-answer__note {
	margin: 0;
	color: var(--ui-text-muted);
}

.dms-ai-palette-answer__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
</style>
