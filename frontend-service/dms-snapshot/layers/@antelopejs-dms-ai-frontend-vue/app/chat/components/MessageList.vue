<script setup lang="ts">
import { computed } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import { ACTIVITY_KINDS } from "../constants/run-status";
import { MESSAGE_ROLES } from "../constants/conversation";
import type {
	ConversationMessage,
	BlockPreviewMessage,
	ErrorMessage,
	MessageAttachment,
	RunProgress,
	UserMessage,
} from "../types/conversation";
import type { PermissionRequestData } from "../types/permission";
import type { ChangeSetSummary } from "../types/protocol";
import { lastMatching } from "../utils/arrays";
import { formatBytes, isInlineImage } from "../utils/attachments";
import { type ReferenceView, referenceView } from "../utils/block-preview";
import { formatTimeOfDay } from "../utils/format";
import { buildRenderItems, type RenderItem } from "../utils/render-items";
import {
	agentQuietMs,
	describeActivity,
	formatClock,
	isAgentQuiet,
	runElapsedMs,
} from "../utils/run-status";
import AnswerRecord from "./AnswerRecord.vue";
import BlockPreviewCard from "./BlockPreviewCard.vue";
import ChangeSetCard from "./ChangeSetCard.vue";
import MarkdownContent from "./MarkdownContent.vue";
import NoticeCard from "./NoticeCard.vue";
import PlanCard from "./PlanCard.vue";
import ToolCluster from "./ToolCluster.vue";
import TurnErrorCard from "./TurnErrorCard.vue";

interface Props {
	messages: ConversationMessage[];
	changeSets: Record<string, ChangeSetSummary>;
	busyChangeSetIds: ReadonlySet<string>;
	requests: PermissionRequestData[];
	isRunning: boolean;
	progress: RunProgress | null;
	nowMs: number;
	isStalled: boolean;
	stalledForMs: number;
}

interface Emits {
	retry: [];
	reconnect: [];
	stop: [];
	focusRequest: [requestId: string];
	undo: [changeSetId: string];
	redo: [changeSetId: string];
	review: [changeSetId: string];
	stopAutoFix: [];
	askAgain: [summary: string];
	runPlan: [];
	editPlan: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t, locale } = useChatI18n();

const MS_PER_DAY = 86_400_000;

const items = computed<RenderItem[]>(() => buildRenderItems(props.messages));

const lastToolsKey = computed<string | null>(
	() => lastMatching(items.value, (item) => item.kind === "tools")?.key ?? null,
);

const lastPlanKey = computed<string | null>(
	() => lastMatching(items.value, (item) => item.kind === "plan")?.key ?? null,
);

const lastErrorId = computed<string | null>(() => {
	const last = props.messages.at(-1);
	return last?.role === MESSAGE_ROLES.ERROR ? last.id : null;
});

const lastAutoFixId = computed<string | null>(() => {
	const notice = lastMatching(
		props.messages,
		(message) =>
			message.role === MESSAGE_ROLES.NOTICE &&
			message.notice.kind === "autofix",
	);
	return notice?.id ?? null;
});

const streamingMessageId = computed<string | null>(() => {
	if (!props.isRunning) return null;
	const last = props.messages.at(-1);
	return last?.role === MESSAGE_ROLES.ASSISTANT ? last.id : null;
});

const showActivity = computed<boolean>(() => {
	if (!props.isRunning) return false;
	if (props.progress?.activity !== ACTIVITY_KINDS.RESPONDING) return true;
	return props.messages.at(-1)?.role !== MESSAGE_ROLES.ASSISTANT;
});

const activityLabel = computed(() => describeActivity(props.progress, t));
const elapsedLabel = computed(() =>
	formatClock(runElapsedMs(props.progress, props.nowMs)),
);
const quietLabel = computed<string>(() => {
	if (!isAgentQuiet(props.progress, props.nowMs)) return "";
	return t("dms_ai.panel.activity.quiet", {
		time: formatClock(agentQuietMs(props.progress, props.nowMs)),
	});
});

function dayLabel(dayMs: number): string {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	if (dayMs === today.getTime()) return t("dms_ai.common.today");
	if (dayMs === today.getTime() - MS_PER_DAY)
		return t("dms_ai.common.yesterday");
	return new Date(dayMs).toLocaleDateString(locale.value, {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

function userMeta(message: UserMessage): string {
	const time = formatTimeOfDay(message.timestampMs, locale.value);
	return message.pagePath
		? `${message.pagePath.replace(/^\/+/, "")} · ${time}`
		: time;
}

function attachmentsOf(message: UserMessage): MessageAttachment[] {
	return message.attachments ?? [];
}

function referenceOf(message: BlockPreviewMessage): ReferenceView | null {
	return referenceView(message.preview.reference, props.messages);
}

function canRetry(error: ErrorMessage): boolean {
	return !props.isRunning && error.id === lastErrorId.value;
}

async function copyAnswer(content: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(content);
	} catch {
		return;
	}
}
</script>

<template>
	<ol class="message-list">
		<template v-for="item in items" :key="item.key">
			<li v-if="item.kind === 'separator'" class="cb-sep">
				{{ dayLabel(item.dayMs) }}
			</li>

			<li v-else-if="item.kind === 'who'" class="cb-who">
				✦ {{ t("dms_ai.panel.assistant") }}
			</li>

			<li
				v-else-if="item.kind === 'tools'"
				class="message-item"
				data-role="tool"
			>
				<ToolCluster
					:tools="item.tools"
					:live="isRunning && item.key === lastToolsKey"
					:is-running="isRunning && item.key === lastToolsKey"
					:requests="requests"
					:now-ms="nowMs"
					@focus-request="(id) => emit('focusRequest', id)"
				/>
			</li>

			<li
				v-else-if="item.kind === 'plan'"
				class="message-item"
				data-role="plan"
			>
				<PlanCard
					:tool="item.tool"
					:can-run="!isRunning && item.key === lastPlanKey"
					@run="emit('runPlan')"
					@edit="emit('editPlan')"
				/>
			</li>

			<li
				v-else-if="item.kind === 'user' && item.message.role === 'user'"
				class="message-item cb-user"
				data-role="user"
			>
				<p v-if="item.message.content" class="message-bubble cb-user__bubble">
					{{ item.message.content }}
				</p>
				<ul
					v-if="attachmentsOf(item.message).length > 0"
					class="cb-user__files"
				>
					<li
						v-for="(att, index) in attachmentsOf(item.message)"
						:key="index"
						class="cb-att"
					>
						<img
							v-if="isInlineImage(att.mimeType) && att.dataUrl"
							:src="att.dataUrl"
							:alt="att.name"
							class="cb-att__thumb"
						/>
						<template v-else>
							<UIcon name="i-ph-file" class="cb-att__icon" />
							<span class="cb-att__name">{{ att.name }}</span>
							<span class="cb-att__size">{{ formatBytes(att.size) }}</span>
						</template>
					</li>
				</ul>
				<span class="cb-user__meta">
					<UIcon v-if="item.message.pagePath" name="i-ph-browser" />
					{{ userMeta(item.message) }}
				</span>
			</li>

			<li
				v-else-if="
					item.kind === 'assistant' && item.message.role === 'assistant'
				"
				class="message-item cb-ai"
				data-role="assistant"
			>
				<MarkdownContent
					class="message-bubble message-bubble-assistant cb-md"
					:content="item.message.content"
					:is-streaming="item.message.id === streamingMessageId"
				/>
				<div
					v-if="item.message.id !== streamingMessageId"
					class="cb-ai__actions"
				>
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						square
						icon="i-ph-copy"
						:aria-label="t('dms_ai.panel.copy_answer')"
						:title="t('dms_ai.panel.copy_answer')"
						@click="copyAnswer(item.message.content)"
					/>
					<span class="cb-ai__meta">
						{{ formatTimeOfDay(item.message.timestampMs, locale) }}
					</span>
				</div>
			</li>

			<li
				v-else-if="item.kind === 'error' && item.message.role === 'error'"
				class="message-item"
				data-role="error"
			>
				<TurnErrorCard
					:error="item.message"
					:can-retry="canRetry(item.message)"
					@retry="emit('retry')"
				/>
			</li>

			<li
				v-else-if="item.kind === 'notice' && item.message.role === 'notice'"
				class="message-item"
				data-role="notice"
			>
				<NoticeCard
					:notice="item.message.notice"
					:can-stop-auto-fix="isRunning && item.message.id === lastAutoFixId"
					@stop-auto-fix="emit('stopAutoFix')"
					@ask-again="(summary) => emit('askAgain', summary)"
				/>
			</li>

			<li
				v-else-if="
					item.kind === 'change' &&
					item.message.role === 'change_set' &&
					changeSets[item.message.changeSetId]
				"
				class="message-item"
				data-role="change"
			>
				<ChangeSetCard
					:change-set="changeSets[item.message.changeSetId]"
					:is-busy="busyChangeSetIds.has(item.message.changeSetId)"
					@undo="emit('undo', item.message.changeSetId)"
					@redo="emit('redo', item.message.changeSetId)"
					@review="emit('review', item.message.changeSetId)"
				/>
			</li>

			<li
				v-else-if="
					item.kind === 'answers' && item.message.role === 'question_answer'
				"
				class="message-item"
				data-role="answers"
			>
				<AnswerRecord :answers="item.message.answers" />
			</li>

			<li
				v-else-if="
					item.kind === 'preview' && item.message.role === 'block_preview'
				"
				class="message-item"
				data-role="preview"
			>
				<BlockPreviewCard
					:preview="item.message.preview"
					:reference="referenceOf(item.message)"
				/>
			</li>
		</template>

		<li v-if="isStalled" class="message-item" data-role="status">
			<div class="run-stalled" role="alert">
				<UIcon name="i-ph-wifi-slash" class="run-stalled__icon" />
				<span>
					{{
						t("dms_ai.panel.activity.stalled", {
							time: formatClock(stalledForMs),
						})
					}}
				</span>
				<UButton
					size="xs"
					color="neutral"
					variant="outline"
					:label="t('dms_ai.panel.connection.reconnect')"
					@click="emit('reconnect')"
				/>
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					:label="t('dms_ai.panel.composer.stop')"
					@click="emit('stop')"
				/>
			</div>
		</li>
		<li v-else-if="showActivity" class="message-item" data-role="status">
			<div class="cb-thinking thinking" aria-live="polite">
				<span class="cb-thinking__dots" aria-hidden="true">
					<i />
					<i />
					<i />
				</span>
				<span class="thinking-label">{{ activityLabel }}</span>
				<span v-if="quietLabel" class="thinking-quiet">{{ quietLabel }}</span>
				<span class="thinking-clock">{{ elapsedLabel }}</span>
			</div>
		</li>
	</ol>
</template>

<style scoped>
.message-list {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin: 0;
	padding: 16px 14px 20px;
	list-style: none;
}

.message-item {
	display: grid;
	gap: 6px;
	min-width: 0;
}

.cb-sep {
	display: flex;
	align-items: center;
	gap: 10px;
	color: var(--ui-text-dimmed);
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.cb-sep::before,
.cb-sep::after {
	content: "";
	flex: 1;
	height: 1px;
	background: var(--ui-border);
}

.cb-who {
	margin-bottom: -6px;
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ai);
}

.cb-user {
	align-self: flex-end;
	justify-items: end;
	max-width: 86%;
	gap: 4px;
}

.message-bubble {
	margin: 0;
	overflow-wrap: anywhere;
}

.cb-user__bubble {
	padding: 9px 12px;
	border: 1px solid var(--ui-border);
	border-radius: 14px 14px 4px 14px;
	background: var(--ui-bg-accented);
	color: var(--ui-text-highlighted);
	font-size: 13.5px;
	line-height: 1.5;
	white-space: pre-wrap;
}

.cb-user__meta,
.cb-ai__meta {
	display: flex;
	align-items: center;
	gap: 6px;
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.cb-user__files {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.cb-att {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	max-width: 220px;
	padding: 4px 8px;
	border: 1px solid var(--ui-border);
	border-radius: 7px;
	background: var(--dms-surface-card);
	font-size: 12px;
	color: var(--ui-text-toned);
}

.cb-att:has(.cb-att__thumb) {
	padding: 0;
	overflow: hidden;
}

.cb-att__thumb {
	max-width: 180px;
	max-height: 180px;
	object-fit: contain;
}

.cb-att__icon {
	width: 14px;
	height: 14px;
	color: var(--ui-text-muted);
}

.cb-att__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cb-att__size {
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.message-bubble-assistant {
	color: var(--ui-text-toned);
	font-size: 13.5px;
	line-height: 1.6;
}

.cb-ai__actions {
	display: flex;
	align-items: center;
	gap: 2px;
	margin-top: -4px;
	color: var(--ui-text-dimmed);
}

.cb-thinking {
	display: flex;
	align-items: center;
	gap: 10px;
	color: var(--ui-text-muted);
	font-size: 13px;
}

.cb-thinking__dots {
	display: inline-flex;
	gap: 4px;
}

.cb-thinking__dots i {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--ai);
	animation: dms-ai-bounce 1.1s ease-in-out infinite;
}

.cb-thinking__dots i:nth-child(2) {
	animation-delay: 0.15s;
}

.cb-thinking__dots i:nth-child(3) {
	animation-delay: 0.3s;
}

.thinking-quiet {
	color: var(--ui-text-toned);
	font-size: 11.5px;
}

.thinking-clock {
	margin-left: auto;
	font: 500 11px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.run-stalled {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	padding: 9px 12px;
	border: 1px solid var(--dms-warning-line);
	border-radius: var(--ai-radius-md);
	background: var(--dms-warning-tint);
	font-size: 12.5px;
	color: var(--ui-text-toned);
}

.run-stalled__icon {
	width: 15px;
	height: 15px;
	color: var(--ui-warning);
}

.run-stalled span {
	flex: 1 1 180px;
}

@keyframes dms-ai-bounce {
	0%,
	80%,
	100% {
		transform: translateY(0);
		opacity: 0.45;
	}

	40% {
		transform: translateY(-4px);
		opacity: 1;
	}
}
</style>
