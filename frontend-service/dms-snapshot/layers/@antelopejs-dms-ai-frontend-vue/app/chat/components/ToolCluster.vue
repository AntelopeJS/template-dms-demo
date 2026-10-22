<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import {
	TOOL_CLUSTER_COLLAPSE_LINGER_MS,
	TOOL_CLUSTER_VISIBLE_LIMIT,
} from "../constants/conversation";
import { useChatI18n } from "../composables/useChatI18n";
import type { ToolCallMessage, ToolRowState } from "../types/conversation";
import type { PermissionRequestData } from "../types/permission";
import { formatClock, formatDuration } from "../utils/format";
import { describeTool, toolVerb } from "../utils/tool-lexicon";
import {
	findWaitingRequest,
	toolRowState,
	type WaitingPosition,
} from "../utils/tool-state";
import ToolRow from "./ToolRow.vue";

interface Props {
	tools: ToolCallMessage[];
	/** True while this is the trailing tool activity of a running turn. */
	live: boolean;
	isRunning: boolean;
	requests: PermissionRequestData[];
	nowMs: number;
}

interface Emits {
	focusRequest: [requestId: string];
}

interface ToolView {
	tool: ToolCallMessage;
	state: ToolRowState;
	waiting: WaitingPosition | null;
}

type ClusterTone = "ok" | "run" | "wait" | "err";

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const HEADLINE_SEPARATOR = " · ";
const TONE_ICONS: Record<ClusterTone, string> = {
	ok: "i-ph-check-circle",
	run: "",
	wait: "i-ph-hand-palm",
	err: "i-ph-warning-circle",
};
const FAILING_STATES: readonly ToolRowState[] = ["failed", "denied", "blocked"];

const override = ref<boolean | null>(null);
const showAll = ref(false);
const lingering = ref(false);
let lingerTimer: ReturnType<typeof setTimeout> | null = null;

function clearLinger(): void {
	if (lingerTimer !== null) clearTimeout(lingerTimer);
	lingerTimer = null;
}

watch(
	() => props.live,
	(isLive, wasLive) => {
		clearLinger();
		lingering.value = !isLive && wasLive;
		if (!lingering.value) return;
		lingerTimer = setTimeout(() => {
			lingering.value = false;
		}, TOOL_CLUSTER_COLLAPSE_LINGER_MS);
	},
);

onUnmounted(clearLinger);

const views = computed<ToolView[]>(() =>
	props.tools.map((tool) => {
		const waiting = findWaitingRequest(tool, props.requests);
		return {
			tool,
			waiting,
			state: toolRowState(tool, props.isRunning, waiting),
		};
	}),
);

const tone = computed<ClusterTone>(() => {
	const states = views.value.map((view) => view.state);
	if (states.includes("waiting")) return "wait";
	if (states.includes("running")) return "run";
	if (states.some((state) => FAILING_STATES.includes(state))) return "err";
	return "ok";
});

const isSingle = computed(() => props.tools.length === 1);
const hasAttention = computed(
	() => tone.value === "wait" || tone.value === "err",
);
const isOpen = computed<boolean>(
	() =>
		isSingle.value ||
		(override.value ?? (props.live || lingering.value || hasAttention.value)),
);
const visible = computed<ToolView[]>(() =>
	showAll.value || override.value === true
		? views.value
		: views.value.slice(-TOOL_CLUSTER_VISIBLE_LIMIT),
);
const hiddenCount = computed(() => views.value.length - visible.value.length);

function phrase(tool: ToolCallMessage): string {
	const description = describeTool(tool.toolName, tool.args);
	const verb = toolVerb(description, t);
	return description.target === ""
		? verb
		: `${verb}${HEADLINE_SEPARATOR}${description.target}`;
}

const title = computed(() =>
	tone.value === "run"
		? t("dms_ai.panel.tool.using")
		: t(
				"dms_ai.panel.tool.used",
				{ count: props.tools.length },
				props.tools.length,
			),
);

const headline = computed<string>(() => {
	const current = views.value.find((view) => view.state === "running");
	if (current !== undefined) return phrase(current.tool);
	const verbs = props.tools.map((tool) =>
		toolVerb(describeTool(tool.toolName, tool.args), t).toLocaleLowerCase(),
	);
	return [...new Set(verbs)].join(HEADLINE_SEPARATOR);
});

const clock = computed<string>(() => {
	const first = props.tools[0];
	const last = props.tools.at(-1);
	if (first === undefined || last === undefined) return "";
	if (tone.value === "run") return formatClock(props.nowMs - first.timestampMs);
	if (last.endedAtMs === undefined) return "";
	return formatDuration(last.endedAtMs - first.timestampMs);
});

function toggle(): void {
	override.value = !isOpen.value;
}
</script>

<template>
	<section class="cb-tools" :data-tone="tone">
		<button
			v-if="!isSingle"
			type="button"
			class="cb-tools__head"
			:aria-expanded="isOpen"
			@click="toggle"
		>
			<span v-if="tone === 'run'" class="spin-ai" aria-hidden="true" />
			<UIcon v-else :name="TONE_ICONS[tone]" class="cb-tools__tone" />
			<b>{{ title }}</b>
			<span class="cb-tools__headline">{{ headline }}</span>
			<span class="cb-tools__num">{{ clock }}</span>
			<UIcon
				:name="isOpen ? 'i-ph-caret-down' : 'i-ph-caret-right'"
				class="cb-tools__caret"
			/>
		</button>
		<div v-if="isOpen" class="cb-tools__list" :class="{ 'is-bare': isSingle }">
			<button
				v-if="hiddenCount > 0"
				type="button"
				class="cb-tools__more"
				@click="showAll = true"
			>
				{{ t("dms_ai.panel.tool.earlier", { count: hiddenCount }) }}
			</button>
			<ToolRow
				v-for="view in visible"
				:key="view.tool.id"
				:tool="view.tool"
				:state="view.state"
				:waiting="view.waiting"
				@focus-request="(id) => emit('focusRequest', id)"
			/>
		</div>
	</section>
</template>

<style scoped>
.cb-tools {
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-md);
	background: var(--dms-surface-card);
	overflow: hidden;
}

.cb-tools__head {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	height: 34px;
	padding: 0 10px;
	border: 0;
	background: transparent;
	color: var(--ui-text-toned);
	font-size: 12.5px;
	text-align: left;
	cursor: pointer;
}

.cb-tools__head:hover {
	background: var(--ai-bg-hover);
}

.cb-tools__head b {
	font-weight: 600;
	color: var(--ui-text-highlighted);
	white-space: nowrap;
}

.cb-tools__tone {
	width: 15px;
	height: 15px;
	flex: none;
}

.cb-tools[data-tone="ok"] .cb-tools__tone {
	color: var(--ui-success);
}

.cb-tools[data-tone="wait"] .cb-tools__tone {
	color: var(--ui-warning);
}

.cb-tools[data-tone="err"] .cb-tools__tone {
	color: var(--ui-error);
}

.cb-tools__headline {
	min-width: 0;
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--ui-text-muted);
	font: 450 11.5px var(--ai-font-mono);
}

.cb-tools__num {
	color: var(--ui-text-dimmed);
	font: 500 11px var(--ai-font-mono);
}

.cb-tools__caret {
	width: 13px;
	height: 13px;
	color: var(--ui-text-dimmed);
}

.cb-tools__list {
	padding: 3px 0;
	border-top: 1px solid var(--ui-border-muted);
}

.cb-tools__list.is-bare {
	border-top: 0;
}

.cb-tools__more {
	display: block;
	width: 100%;
	height: 24px;
	padding: 0 10px 0 34px;
	border: 0;
	background: transparent;
	color: var(--ui-text-dimmed);
	font: 500 11px var(--ai-font-mono);
	text-align: left;
	cursor: pointer;
}

.cb-tools__more:hover {
	color: var(--ui-text-highlighted);
}
</style>
