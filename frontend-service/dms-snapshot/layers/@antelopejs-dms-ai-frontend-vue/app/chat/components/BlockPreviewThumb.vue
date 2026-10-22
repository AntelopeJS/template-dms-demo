<script setup lang="ts">
import { computed } from "vue";
import { useBlockPreviewComponent } from "../composables/useBlockPreviewComponent";
import { useChatI18n } from "../composables/useChatI18n";
import {
	PLAN_MAX_CELLS,
	PLAN_MAX_ROWS,
	THUMBNAIL_CANVAS_WIDTH_PX,
	THUMBNAIL_SCALE,
	THUMBNAIL_SKETCH_HEIGHT_PX,
} from "../constants/block-preview";
import type { PreviewNode, PreviewView } from "../types/protocol";
import { countLeaves, rootsOf } from "../utils/block-preview";
import SketchFrame from "./SketchFrame.vue";

interface Props {
	/** The view the thumbnail draws: its blocks, else its sketch. */
	view: PreviewView;
	/** Whether the preview proposes a custom sketch in any of its views. */
	isSketched: boolean;
}

const props = defineProps<Props>();
const { t } = useChatI18n();
const previewComponent = useBlockPreviewComponent();

const canvasStyle = {
	width: `${THUMBNAIL_CANVAS_WIDTH_PX}px`,
	transform: `scale(${THUMBNAIL_SCALE})`,
};

const roots = computed<PreviewNode[]>(() =>
	props.view.tree === undefined
		? []
		: rootsOf(props.view.tree).slice(0, PLAN_MAX_ROWS),
);

function cellCount(node: PreviewNode): number {
	return Math.min(countLeaves(node), PLAN_MAX_CELLS);
}
</script>

<template>
	<span class="bp-thumb" aria-hidden="true">
		<span
			v-if="view.tree && previewComponent"
			class="bp-thumb__canvas"
			:style="canvasStyle"
			inert
		>
			<component :is="previewComponent" :tree="view.tree" />
		</span>
		<span
			v-else-if="!view.tree && view.sketch"
			class="bp-thumb__canvas bp-thumb__canvas--sketch"
			:style="canvasStyle"
			inert
		>
			<SketchFrame
				:sketch="view.sketch"
				:title="t('dms_ai.panel.preview.custom_sketch')"
				:height="THUMBNAIL_SKETCH_HEIGHT_PX"
			/>
		</span>
		<span v-else class="bp-thumb__plan">
			<span v-for="(node, index) in roots" :key="index" class="bp-thumb__row">
				<span
					v-for="cellIndex in cellCount(node)"
					:key="cellIndex"
					class="bp-thumb__cell"
				/>
			</span>
		</span>
		<span v-if="isSketched" class="bp-thumb__badge">
			{{ t("dms_ai.panel.preview.sketch_badge") }}
		</span>
	</span>
</template>

<style scoped>
.bp-thumb {
	position: relative;
	flex: none;
	width: 112px;
	height: 72px;
	overflow: hidden;
	border: 1px solid var(--ai-line);
	border-radius: var(--ai-radius-sm);
	background-color: var(--ui-bg);
	background-image: radial-gradient(var(--ui-border) 1px, transparent 1px);
	background-size: 8px 8px;
}

.bp-thumb__canvas {
	position: absolute;
	top: 6px;
	left: 0;
	transform-origin: top left;
	pointer-events: none;
}

.bp-thumb__canvas--sketch {
	top: 0;
}

.bp-thumb__badge {
	position: absolute;
	right: 4px;
	bottom: 4px;
	padding: 1px 5px;
	border: 1px dashed var(--ai-line);
	border-radius: 999px;
	background: var(--dms-surface-card, var(--ui-bg));
	font: 600 8.5px/1.4 var(--ai-font-mono);
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--ai);
}

.bp-thumb__plan {
	position: absolute;
	inset: 8px;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.bp-thumb__row {
	display: flex;
	flex: 1;
	gap: 4px;
	max-height: 18px;
}

.bp-thumb__cell {
	flex: 1;
	border: 1px solid var(--ai-line);
	border-radius: 3px;
	background: var(--ai-tint);
}
</style>
