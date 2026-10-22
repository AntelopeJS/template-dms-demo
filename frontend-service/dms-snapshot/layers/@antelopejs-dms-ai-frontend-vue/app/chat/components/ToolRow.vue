<script setup lang="ts">
import { computed, ref } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { ToolCallMessage, ToolRowState } from "../types/conversation";
import { formatDuration, stringifyValue } from "../utils/format";
import { describeTool, namedArguments, toolVerb } from "../utils/tool-lexicon";
import { toolDurationMs, type WaitingPosition } from "../utils/tool-state";

interface Props {
	tool: ToolCallMessage;
	state: ToolRowState;
	waiting: WaitingPosition | null;
}

interface Emits {
	focusRequest: [requestId: string];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const STATE_ICONS: Record<ToolRowState, string> = {
	done: "i-ph-check",
	running: "",
	waiting: "i-ph-hand-palm",
	denied: "i-ph-prohibit",
	blocked: "i-ph-shield-warning",
	failed: "i-ph-warning-circle",
	stopped: "i-ph-minus-circle",
};

const isOpen = ref(false);
const isRaw = ref(false);

const description = computed(() =>
	describeTool(props.tool.toolName, props.tool.args),
);
const verb = computed(() => toolVerb(description.value, t));
const args = computed(() => namedArguments(props.tool.args));
const rawArgs = computed(() => stringifyValue(props.tool.args));
const resultText = computed(() => stringifyValue(props.tool.result));

const stateLabel = computed<string>(() => {
	if (props.state === "done") {
		const duration = toolDurationMs(props.tool);
		return duration === null ? "" : formatDuration(duration);
	}
	if (props.state === "waiting" && props.waiting !== null)
		return t("dms_ai.panel.tool.waiting_position", {
			index: props.waiting.index + 1,
			total: props.waiting.total,
		});
	return t(`dms_ai.panel.tool.state.${props.state}`);
});

function onRowClick(): void {
	if (props.state === "waiting" && props.waiting !== null) {
		emit("focusRequest", props.waiting.requestId);
		return;
	}
	isOpen.value = !isOpen.value;
}
</script>

<template>
	<div class="cb-tool-wrap">
		<button
			type="button"
			class="cb-tool"
			:class="[`is-${state}`, { 'is-open': isOpen }]"
			:aria-expanded="state === 'waiting' ? undefined : isOpen"
			@click="onRowClick"
		>
			<UIcon :name="description.icon" class="cb-tool__icon" />
			<span class="cb-tool__label">{{ verb }}</span>
			<span class="cb-tool__target">{{ description.target }}</span>
			<span class="cb-tool__state">
				<span v-if="state === 'running'" class="spin-ai" aria-hidden="true" />
				<UIcon v-else :name="STATE_ICONS[state]" class="cb-tool__state-icon" />
				{{ stateLabel }}
			</span>
		</button>
		<div v-if="isOpen" class="cb-tool__detail">
			<dl v-if="!isRaw && args.length > 0" class="cb-kv">
				<template v-for="arg in args" :key="arg.name">
					<dt>{{ arg.name }}</dt>
					<dd>{{ arg.value }}</dd>
				</template>
			</dl>
			<pre v-if="isRaw" class="cb-raw">{{ rawArgs }}</pre>
			<pre v-if="isRaw && resultText" class="cb-raw">{{ resultText }}</pre>
			<div class="cb-tool__actions">
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					icon="i-ph-brackets-curly"
					:label="
						isRaw
							? t('dms_ai.panel.tool.named_args')
							: t('dms_ai.panel.tool.raw_json')
					"
					@click="isRaw = !isRaw"
				/>
			</div>
		</div>
	</div>
</template>

<style scoped>
.cb-tool {
	display: grid;
	grid-template-columns: 16px auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 8px;
	width: 100%;
	min-height: 28px;
	padding: 0 10px;
	border: 0;
	background: transparent;
	color: inherit;
	font-size: 12.5px;
	text-align: left;
	cursor: pointer;
}

.cb-tool:hover {
	background: var(--ai-bg-hover);
}

.cb-tool:focus-visible {
	outline: 2px solid var(--ai-line);
	outline-offset: -2px;
}

.cb-tool__icon {
	width: 15px;
	height: 15px;
	color: var(--ui-text-muted);
}

.cb-tool__label {
	color: var(--ui-text-toned);
	font-weight: 500;
	white-space: nowrap;
}

.cb-tool__target {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font: 450 11.5px var(--ai-font-mono);
	color: var(--ui-text-muted);
}

.cb-tool__state {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	font: 500 11px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
	white-space: nowrap;
}

.cb-tool__state-icon {
	width: 13px;
	height: 13px;
}

.cb-tool.is-done .cb-tool__state-icon {
	color: var(--ui-success);
}

.cb-tool.is-running .cb-tool__state {
	color: var(--ai);
}

.cb-tool.is-waiting {
	background: var(--dms-warning-tint);
}

.cb-tool.is-waiting .cb-tool__state {
	color: var(--ui-warning);
}

.cb-tool.is-denied .cb-tool__state {
	color: var(--ui-text-toned);
}

.cb-tool.is-denied .cb-tool__state-icon,
.cb-tool.is-failed .cb-tool__state {
	color: var(--ui-error);
}

.cb-tool.is-blocked .cb-tool__state {
	color: var(--ui-warning);
}

.cb-tool.is-open {
	background: var(--ai-bg-hover);
}

.cb-tool__detail {
	display: grid;
	gap: 6px;
	margin: 2px 10px 8px 34px;
}

.cb-kv {
	display: grid;
	grid-template-columns: minmax(56px, max-content) minmax(0, 1fr);
	gap: 3px 10px;
	margin: 0;
	padding: 8px 10px;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-bg-field);
	font: 450 11.5px / 1.5 var(--ai-font-mono);
	color: var(--ui-text-toned);
}

.cb-kv dt {
	color: var(--ui-text-dimmed);
}

.cb-kv dd {
	margin: 0;
	overflow-wrap: anywhere;
}

.cb-raw {
	margin: 0;
	max-height: 260px;
	overflow: auto;
	padding: 8px 10px;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-bg-field);
	font: 450 11px / 1.5 var(--ai-font-mono);
	color: var(--ui-text-toned);
	white-space: pre-wrap;
	word-break: break-word;
}

.cb-tool__actions {
	display: flex;
	gap: 6px;
}
</style>
