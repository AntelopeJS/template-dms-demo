<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { ConversationSummary } from "../types/conversation";
import {
	conversationTime,
	groupConversations,
} from "../utils/conversation-groups";
import { formatTokens } from "../utils/format";

interface Props {
	open: boolean;
	conversations: ConversationSummary[];
	activeId: string;
	nowMs: number;
}

interface Emits {
	select: [id: string];
	delete: [conversation: ConversationSummary];
	new: [];
	close: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t, locale } = useChatI18n();

const SEARCH_KEY = "/";
const ESCAPE_KEY = "Escape";

const search = ref("");
const searchEl = ref<HTMLInputElement | null>(null);
const confirming = ref<ConversationSummary | null>(null);

const groups = computed(() =>
	groupConversations(props.conversations, props.nowMs, search.value),
);
const isEmpty = computed(() => props.conversations.length === 0);

watch(
	() => props.open,
	(isOpen) => {
		if (!isOpen) return;
		search.value = "";
		void nextTick(() => searchEl.value?.focus());
	},
);

function groupLabel(key: string, count: number): string {
	return t(`dms_ai.panel.drawer.group_${key}`, { count });
}

function time(item: ConversationSummary): string {
	return conversationTime(
		item.updatedAtMs,
		props.nowMs,
		locale.value,
		t("dms_ai.common.now"),
	);
}

// Files still changed first; a chat whose changes were all undone says so.
function changesLabel(files: number, undone: number): string {
	if (files > 0) return t("dms_ai.panel.drawer.files", { count: files }, files);
	if (undone > 0)
		return t("dms_ai.panel.drawer.files_undone", { count: undone }, undone);
	return t("dms_ai.panel.drawer.no_changes");
}

function meta(item: ConversationSummary): string[] {
	const parts: string[] = [];
	parts.push(changesLabel(item.filesChanged ?? 0, item.filesUndone ?? 0));
	if (item.provider === "codex") parts.push(t("dms_ai.common.agent.codex"));
	if ((item.totalTokens ?? 0) > 0)
		parts.push(
			t("dms_ai.panel.drawer.tokens", {
				count: formatTokens(item.totalTokens ?? 0),
			}),
		);
	return parts;
}

function requestDelete(item: ConversationSummary): void {
	if (item.isRunning === true) {
		confirming.value = item;
		return;
	}
	emit("delete", item);
}

function onConfirmOpenChange(isOpen: boolean): void {
	if (!isOpen) confirming.value = null;
}

function confirmDelete(): void {
	const item = confirming.value;
	confirming.value = null;
	if (item !== null) emit("delete", item);
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === ESCAPE_KEY) {
		event.stopPropagation();
		emit("close");
		return;
	}
	if (event.key !== SEARCH_KEY || event.target === searchEl.value) return;
	event.preventDefault();
	searchEl.value?.focus();
}
</script>

<template>
	<div v-if="open" class="cb-drawer-wrap drawer-root" @keydown="onKeydown">
		<div class="cb-drawer__scrim" @click="emit('close')" />
		<aside
			class="cb-drawer"
			role="dialog"
			:aria-label="t('dms_ai.panel.drawer.title')"
		>
			<div class="cb-drawer__head">
				<h3>{{ t("dms_ai.panel.drawer.title") }}</h3>
				<UButton
					size="xs"
					color="secondary"
					icon="i-ph-plus"
					:label="t('dms_ai.panel.drawer.new')"
					@click="emit('new')"
				/>
				<UButton
					size="sm"
					color="neutral"
					variant="ghost"
					square
					icon="i-ph-x"
					:aria-label="t('dms_ai.common.close')"
					@click="emit('close')"
				/>
			</div>
			<template v-if="!isEmpty">
				<div class="cb-drawer__search">
					<UIcon name="i-ph-magnifying-glass" class="cb-drawer__search-icon" />
					<input
						ref="searchEl"
						v-model="search"
						type="search"
						:placeholder="t('dms_ai.panel.drawer.search')"
						:aria-label="t('dms_ai.panel.drawer.search')"
					/>
					<UKbd :value="SEARCH_KEY" size="sm" />
				</div>
				<div class="cb-drawer__list">
					<p v-if="groups.length === 0" class="cb-drawer__none">
						{{ t("dms_ai.panel.drawer.no_match") }}
					</p>
					<template v-for="group in groups" :key="group.key">
						<span class="cb-drawer__group">
							{{ groupLabel(group.key, group.items.length) }}
						</span>
						<div
							v-for="item in group.items"
							:key="item.id"
							class="convo"
							:class="{ 'is-active': item.id === activeId }"
						>
							<button
								type="button"
								class="convo__open"
								@click="emit('select', item.id)"
							>
								<span class="convo__title">
									{{ item.title || t("dms_ai.panel.new_conversation") }}
								</span>
								<span class="convo__time">{{ time(item) }}</span>
								<span class="convo__meta">
									<span
										v-if="(item.pendingApprovals ?? 0) > 0"
										class="convo__wait"
									>
										<UIcon name="i-ph-hand-palm" />
										{{
											t(
												"dms_ai.panel.drawer.approvals_waiting",
												{ count: item.pendingApprovals ?? 0 },
												item.pendingApprovals ?? 0,
											)
										}}
									</span>
									<span
										v-else-if="(item.pendingQuestions ?? 0) > 0"
										class="convo__wait"
									>
										<UIcon name="i-ph-question" />
										{{ t("dms_ai.panel.drawer.question_waiting") }}
									</span>
									<span v-else-if="item.isRunning" class="convo__run">
										<span class="spin-ai" />
										{{ t("dms_ai.panel.drawer.working") }}
									</span>
									<template v-for="(part, index) in meta(item)" :key="index">
										<span class="convo__sep">·</span>
										{{ part }}
									</template>
								</span>
							</button>
							<UButton
								size="xs"
								color="neutral"
								variant="ghost"
								square
								icon="i-ph-trash"
								class="convo__delete"
								:aria-label="t('dms_ai.panel.drawer.delete')"
								:title="t('dms_ai.panel.drawer.delete')"
								@click="requestDelete(item)"
							/>
						</div>
					</template>
				</div>
			</template>
			<div v-else class="cb-drawer__empty">
				<DmsEmptyState
					icon="i-ph-sparkle"
					tone="secondary"
					:title="t('dms_ai.panel.drawer.empty_title')"
					:description="t('dms_ai.panel.drawer.empty_text')"
				>
					<template #actions>
						<UButton
							size="sm"
							color="secondary"
							icon="i-ph-plus"
							:label="t('dms_ai.panel.drawer.start')"
							@click="emit('new')"
						/>
					</template>
				</DmsEmptyState>
			</div>
		</aside>
		<UModal
			:open="confirming !== null"
			:title="t('dms_ai.panel.drawer.confirm_title')"
			@update:open="onConfirmOpenChange"
		>
			<template #body>
				<p class="cb-drawer__confirm">
					{{
						t("dms_ai.panel.drawer.confirm_text", {
							title: confirming?.title ?? "",
						})
					}}
				</p>
			</template>
			<template #footer>
				<div class="cb-drawer__confirm-foot">
					<UButton
						color="neutral"
						variant="outline"
						:label="t('dms_ai.common.cancel')"
						@click="confirming = null"
					/>
					<UButton
						color="error"
						:label="t('dms_ai.panel.drawer.confirm_action')"
						@click="confirmDelete"
					/>
				</div>
			</template>
		</UModal>
	</div>
</template>

<style scoped>
.cb-drawer-wrap {
	position: absolute;
	inset: 0;
	z-index: 6;
	display: flex;
}

.cb-drawer__scrim {
	position: absolute;
	inset: 0;
	background: var(--dms-overlay);
}

.cb-drawer {
	position: relative;
	display: flex;
	flex-direction: column;
	width: 330px;
	max-width: 88%;
	height: 100%;
	border-right: 1px solid var(--dms-border-top);
	background: var(--ui-bg-elevated);
	box-shadow: var(--dms-shadow-modal);
}

.cb-drawer__head {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 52px;
	padding: 0 8px 0 14px;
	border-bottom: 1px solid var(--ui-border);
}

.cb-drawer__head h3 {
	margin: 0 auto 0 0;
	font-size: 13px;
	font-weight: 650;
}

.cb-drawer__search {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 10px 12px 6px;
	padding: 0 6px 0 8px;
	height: 30px;
	border: 1px solid var(--ui-border-accented);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-bg-field);
}

.cb-drawer__search:focus-within {
	border-color: var(--ai-line);
	box-shadow: 0 0 0 3px var(--ai-tint);
}

.cb-drawer__search-icon {
	width: 14px;
	height: 14px;
	color: var(--ui-text-dimmed);
}

.cb-drawer__search input {
	flex: 1;
	min-width: 0;
	border: 0;
	outline: 0;
	background: transparent;
	color: var(--ui-text-highlighted);
	font: inherit;
	font-size: 12.5px;
}

.cb-drawer__list {
	flex: 1;
	padding: 4px 8px 10px;
	overflow: auto;
}

.cb-drawer__group {
	display: block;
	padding: 10px 6px 6px;
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ui-text-muted);
}

.cb-drawer__none {
	padding: 16px 6px;
	font-size: 12.5px;
	color: var(--ui-text-muted);
}

.convo {
	position: relative;
	border-radius: var(--ai-radius-sm);
}

.convo:hover,
.convo:focus-within {
	background: var(--ai-bg-hover);
}

.convo.is-active {
	background: var(--ai-tint);
}

.convo__open {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 2px 8px;
	width: 100%;
	padding: 8px 36px 8px 8px;
	border: 0;
	background: transparent;
	color: inherit;
	text-align: left;
	cursor: pointer;
}

.convo__title {
	overflow: hidden;
	font-size: 12.5px;
	font-weight: 550;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--ui-text-highlighted);
}

.convo__time {
	align-self: center;
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.convo__meta {
	grid-column: 1 / -1;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0 6px;
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-muted);
}

.convo__meta > .convo__sep:first-child {
	display: none;
}

.convo__sep {
	color: var(--ui-text-dimmed);
}

.convo__run {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	color: var(--ai);
}

.convo__wait {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--ui-warning);
}

.convo__delete {
	position: absolute;
	top: 6px;
	right: 6px;
	opacity: 0;
}

.convo:hover .convo__delete,
.convo:focus-within .convo__delete {
	opacity: 1;
}

.cb-drawer__empty {
	display: grid;
	flex: 1;
	place-content: center;
	padding: 24px;
}

.cb-drawer__confirm {
	margin: 0;
	font-size: 13px;
	line-height: 1.5;
	color: var(--ui-text-muted);
}

.cb-drawer__confirm-foot {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	width: 100%;
}
</style>
