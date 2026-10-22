<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { QueuedMessage } from "../types/conversation";

interface Props {
	queue: QueuedMessage[];
}

interface Emits {
	cancel: [id: string];
	update: [id: string, content: string];
	move: [id: string, toIndex: number];
	clear: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const MOVE_KEYS: Record<string, number> = { ArrowUp: -1, ArrowDown: 1 };

const editingId = ref<string | null>(null);
const draft = ref("");
const draggedId = ref<string | null>(null);
const editorEl = ref<HTMLTextAreaElement[]>([]);

function startEdit(item: QueuedMessage): void {
	editingId.value = item.id;
	draft.value = item.content;
	void nextTick(() => editorEl.value[0]?.focus());
}

function saveEdit(): void {
	const id = editingId.value;
	const content = draft.value.trim();
	editingId.value = null;
	if (id === null || content === "") return;
	emit("update", id, content);
}

function onEditorKeydown(event: KeyboardEvent): void {
	if (event.key === "Escape") {
		event.stopPropagation();
		editingId.value = null;
		return;
	}
	if (event.key !== "Enter" || event.shiftKey) return;
	event.preventDefault();
	saveEdit();
}

function onHandleKeydown(
	event: KeyboardEvent,
	index: number,
	id: string,
): void {
	const step = MOVE_KEYS[event.key];
	if (step === undefined) return;
	event.preventDefault();
	const target = index + step;
	if (target < 0 || target >= props.queue.length) return;
	emit("move", id, target);
}

function onDrop(index: number): void {
	const id = draggedId.value;
	draggedId.value = null;
	if (id === null) return;
	emit("move", id, index);
}
</script>

<template>
	<section class="cb-queue" :aria-label="t('dms_ai.panel.queue.aria')">
		<div class="cb-queue__head">
			<span class="cb-queue__title">{{ t("dms_ai.panel.queue.title") }}</span>
			<UButton
				v-if="queue.length > 1"
				size="xs"
				color="neutral"
				variant="ghost"
				:label="t('dms_ai.panel.queue.clear')"
				@click="emit('clear')"
			/>
		</div>
		<ol class="cb-queue__list">
			<li
				v-for="(item, index) in queue"
				:key="item.id"
				class="cb-queued"
				:class="{
					'is-editing': editingId === item.id,
					'is-dragged': draggedId === item.id,
				}"
				@dragover.prevent
				@drop="onDrop(index)"
			>
				<template v-if="editingId === item.id">
					<span class="cb-queued__n">{{ index + 1 }}</span>
					<span class="cb-queued__editing">
						{{ t("dms_ai.panel.queue.editing") }}
					</span>
					<textarea
						ref="editorEl"
						v-model="draft"
						class="cb-queued__editor"
						rows="2"
						:aria-label="t('dms_ai.panel.queue.edit')"
						@keydown="onEditorKeydown"
					/>
					<div class="cb-queued__actions">
						<UButton
							size="xs"
							color="neutral"
							variant="ghost"
							:label="t('dms_ai.common.cancel')"
							@click="editingId = null"
						/>
						<UButton
							size="xs"
							color="neutral"
							variant="outline"
							:label="t('dms_ai.common.save')"
							@click="saveEdit"
						/>
					</div>
				</template>
				<template v-else>
					<button
						type="button"
						class="cb-queued__handle"
						draggable="true"
						:aria-label="t('dms_ai.panel.queue.reorder')"
						:title="t('dms_ai.panel.queue.reorder')"
						@dragstart="draggedId = item.id"
						@dragend="draggedId = null"
						@keydown="onHandleKeydown($event, index, item.id)"
					>
						<UIcon name="i-ph-dots-six-vertical" />
					</button>
					<span class="cb-queued__n">
						{{ index === 0 ? t("dms_ai.panel.queue.next") : index + 1 }}
					</span>
					<span class="cb-queued__txt">{{ item.content }}</span>
					<span v-if="item.attachments.length > 0" class="cb-queued__files">
						<UIcon name="i-ph-paperclip" />
						{{
							t(
								"dms_ai.panel.queue.files",
								{ count: item.attachments.length },
								item.attachments.length,
							)
						}}
					</span>
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						square
						icon="i-ph-pencil-simple"
						:aria-label="t('dms_ai.panel.queue.edit')"
						:title="t('dms_ai.panel.queue.edit')"
						@click="startEdit(item)"
					/>
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						square
						icon="i-ph-x"
						:aria-label="t('dms_ai.panel.queue.cancel')"
						:title="t('dms_ai.panel.queue.cancel')"
						@click="emit('cancel', item.id)"
					/>
				</template>
			</li>
		</ol>
	</section>
</template>

<style scoped>
.cb-queue {
	display: grid;
	gap: 6px;
	padding: 8px 14px;
	border-bottom: 1px solid var(--ui-border-muted);
}

.cb-queue__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: 24px;
}

.cb-queue__title {
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ui-text-muted);
}

.cb-queue__list {
	display: grid;
	gap: 6px;
	max-height: 168px;
	margin: 0;
	padding: 0;
	overflow: auto;
	list-style: none;
}

.cb-queued {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 32px;
	padding: 4px 4px 4px 6px;
	border: 1px dashed var(--ui-border-accented);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-surface-card);
	font-size: 12.5px;
	color: var(--ui-text-toned);
}

.cb-queued.is-dragged {
	opacity: 0.5;
}

.cb-queued.is-editing {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 6px 8px;
	padding: 6px 6px 6px 10px;
	border-style: solid;
	border-color: var(--ai-line);
	box-shadow: 0 0 0 3px var(--ai-tint);
}

.cb-queued__handle {
	display: grid;
	place-items: center;
	width: 18px;
	height: 22px;
	padding: 0;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: var(--ui-text-dimmed);
	cursor: grab;
}

.cb-queued__handle:focus-visible {
	outline: 2px solid var(--ai-line);
}

.cb-queued__n {
	font: 600 10px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.cb-queued__editing {
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ai);
}

.cb-queued__txt {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cb-queued__files {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 0 6px;
	height: 20px;
	border: 1px solid var(--ui-border);
	border-radius: 6px;
	font-size: 10.5px;
	color: var(--ui-text-muted);
}

.cb-queued__editor {
	grid-column: 1 / -1;
	width: 100%;
	padding: 6px 8px;
	border: 1px solid var(--ui-border-accented);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-bg-field);
	color: var(--ui-text-highlighted);
	font: inherit;
	font-size: 12.5px;
	resize: vertical;
	outline: none;
}

.cb-queued__actions {
	grid-column: 1 / -1;
	display: flex;
	justify-content: flex-end;
	gap: 6px;
}
</style>
