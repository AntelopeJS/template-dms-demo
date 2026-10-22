<script setup lang="ts">
import { computed, ref } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import { CARD_TYPE_LIMIT } from "../constants/block-preview";
import type { BlockPreview } from "../types/protocol";
import {
	countBlocks,
	hasSketch,
	type ReferenceView,
	topBlockTypes,
} from "../utils/block-preview";
import BlockPreviewModal from "./BlockPreviewModal.vue";
import BlockPreviewThumb from "./BlockPreviewThumb.vue";

interface Props {
	preview: BlockPreview;
	reference: ReferenceView | null;
}

const props = defineProps<Props>();
const { t } = useChatI18n();
const isOpen = ref(false);

const META_SEPARATOR = " · ";

const isSketched = computed<boolean>(() => hasSketch(props.preview));

const typesLabel = computed<string>(() => {
	const types = topBlockTypes(props.preview.tree);
	const shown = types.slice(0, CARD_TYPE_LIMIT).join(", ");
	const hidden = types.length - CARD_TYPE_LIMIT;
	return hidden > 0 ? `${shown} +${hidden}` : shown;
});

const meta = computed<string>(() => {
	const blocks = countBlocks(props.preview.tree);
	const variants = props.preview.variants?.length ?? 0;
	const parts = [
		typesLabel.value,
		blocks > 0
			? t("dms_ai.panel.preview.blocks", { count: blocks }, blocks)
			: "",
		variants > 0
			? t(
					"dms_ai.panel.preview.variants",
					{ count: variants + 1 },
					variants + 1,
				)
			: "",
		isSketched.value ? t("dms_ai.panel.preview.with_sketch") : "",
		props.reference ? t("dms_ai.panel.preview.with_mockup") : "",
	];
	return parts.filter((part) => part !== "").join(META_SEPARATOR);
});
</script>

<template>
	<div class="bp">
		<span class="bp__who">✦ {{ t("dms_ai.panel.preview.eyebrow") }}</span>
		<button
			type="button"
			class="bp-card"
			aria-haspopup="dialog"
			:aria-expanded="isOpen"
			:aria-label="
				t('dms_ai.panel.preview.open_aria', { title: preview.title })
			"
			@click="isOpen = true"
		>
			<BlockPreviewThumb :view="preview" :is-sketched="isSketched" />
			<span class="bp-card__body">
				<span class="bp-card__title">{{ preview.title }}</span>
				<span class="bp-card__meta">{{ meta }}</span>
				<span class="bp-card__open">
					<UIcon name="i-ph-frame-corners" class="bp-card__open-icon" />
					{{ t("dms_ai.panel.preview.open") }}
				</span>
			</span>
		</button>
		<BlockPreviewModal
			v-model:open="isOpen"
			:preview="preview"
			:reference="reference"
		/>
	</div>
</template>

<style scoped>
.bp {
	display: grid;
	gap: 8px;
	justify-items: start;
}

.bp__who {
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ai);
}

.bp-card {
	display: flex;
	align-items: stretch;
	gap: 12px;
	width: min(100%, 360px);
	padding: 8px 12px 8px 8px;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-md);
	background: var(--dms-surface-card, var(--ui-bg));
	color: inherit;
	text-align: left;
	cursor: pointer;
	transition:
		border-color 0.15s ease,
		background-color 0.15s ease;
}

.bp-card:hover {
	border-color: var(--ai-line);
	background: var(--ai-bg-hover);
}

.bp-card:focus-visible {
	outline: 2px solid var(--ai);
	outline-offset: 2px;
}

.bp-card__body {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}

.bp-card__title {
	overflow: hidden;
	font-size: 13px;
	font-weight: 600;
	line-height: 1.35;
	color: var(--ui-text-highlighted);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.bp-card__meta {
	font: 500 10.5px/1.45 var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.bp-card__open {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	margin-top: auto;
	font-size: 12px;
	font-weight: 600;
	color: var(--ai);
}

.bp-card__open-icon {
	width: 13px;
	height: 13px;
}

@media (prefers-reduced-motion: reduce) {
	.bp-card {
		transition: none;
	}
}
</style>
