<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { createIncrementalMarkdown, renderMarkdown } from "../utils/markdown";

interface Props {
	content: string;
	/** True while the answer is still arriving: the tail is re-rendered once a frame. */
	isStreaming?: boolean;
}

const props = defineProps<Props>();

const STREAMED_RENDER_DELAY_MS = 50;

const settled = ref<readonly string[]>([]);
const open = ref("");
let incremental = createIncrementalMarkdown();
let pendingFrame: ReturnType<typeof setTimeout> | null = null;

function renderWhole(): void {
	incremental = createIncrementalMarkdown();
	settled.value = [];
	open.value = renderMarkdown(props.content);
}

function renderStreamed(): void {
	pendingFrame = null;
	const blocks = incremental.render(props.content);
	settled.value = blocks.settled;
	open.value = blocks.open;
}

function scheduleStreamed(): void {
	if (pendingFrame !== null) return;
	pendingFrame = setTimeout(renderStreamed, STREAMED_RENDER_DELAY_MS);
}

function cancelStreamed(): void {
	if (pendingFrame !== null) clearTimeout(pendingFrame);
	pendingFrame = null;
}

watch(
	() => [props.content, props.isStreaming === true] as const,
	([, isStreaming]) => {
		if (isStreaming) {
			scheduleStreamed();
			return;
		}
		cancelStreamed();
		renderWhole();
	},
	{ immediate: true },
);

onBeforeUnmount(cancelStreamed);
</script>

<template>
	<div class="chat-markdown">
		<div
			v-for="(block, index) in settled"
			:key="index"
			class="chat-markdown-block"
			v-html="block"
		/>
		<div class="chat-markdown-block" v-html="open" />
	</div>
</template>

<style scoped>
.chat-markdown-block {
	display: contents;
}

.chat-markdown-block:first-child > :deep(:first-child) {
	margin-top: 0;
}

.chat-markdown-block:last-child > :deep(:last-child) {
	margin-bottom: 0;
}

.chat-markdown :deep(p) {
	margin: 0 0 8px;
}

.chat-markdown :deep(ul),
.chat-markdown :deep(ol) {
	margin: 0 0 8px;
	padding-left: 20px;
}

.chat-markdown :deep(li) {
	margin: 2px 0;
}

.chat-markdown :deep(li > ul),
.chat-markdown :deep(li > ol) {
	margin: 2px 0;
}

.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4),
.chat-markdown :deep(h5),
.chat-markdown :deep(h6) {
	margin: 12px 0 6px;
	line-height: 1.3;
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.chat-markdown :deep(h1) {
	font-size: 1.3em;
}

.chat-markdown :deep(h2) {
	font-size: 1.2em;
}

.chat-markdown :deep(h3) {
	font-size: 1.1em;
}

.chat-markdown :deep(h4),
.chat-markdown :deep(h5),
.chat-markdown :deep(h6) {
	font-size: 1em;
}

.chat-markdown :deep(a) {
	color: var(--dms-accent);
	text-decoration: underline;
	text-underline-offset: 2px;
}

.chat-markdown :deep(code) {
	font-family: var(--ai-font-mono);
	font-size: 0.9em;
	background: var(--ui-bg-accented);
	border: 1px solid var(--ui-border);
	border-radius: 6px;
	padding: 1px 4px;
}

.chat-markdown :deep(pre) {
	margin: 0 0 8px;
	padding: 10px 12px;
	overflow-x: auto;
	background: var(--ui-bg-accented);
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
}

.chat-markdown :deep(pre code) {
	background: none;
	border: 0;
	padding: 0;
}

.chat-markdown :deep(blockquote) {
	margin: 0 0 8px;
	padding: 2px 0 2px 12px;
	border-left: 3px solid var(--ui-border-accented);
	color: var(--ui-text-muted);
}

.chat-markdown :deep(table) {
	display: block;
	overflow-x: auto;
	border-collapse: collapse;
	margin: 0 0 8px;
	font-size: 0.95em;
}

.chat-markdown :deep(th),
.chat-markdown :deep(td) {
	border: 1px solid var(--ui-border);
	padding: 4px 8px;
	text-align: left;
}

.chat-markdown :deep(th) {
	background: var(--ui-bg-accented);
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.chat-markdown :deep(hr) {
	border: 0;
	border-top: 1px solid var(--ui-border);
	margin: 12px 0;
}
</style>
