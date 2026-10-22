<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useBlockPreviewComponent } from "../composables/useBlockPreviewComponent";
import { useChatI18n } from "../composables/useChatI18n";
import { BLOCK_PREVIEW_MAIN_TAB } from "../constants/block-preview";
import type { BlockPreview } from "../types/protocol";
import {
	type BlockPreviewTab,
	formatTree,
	previewTabs,
	type ReferenceView,
} from "../utils/block-preview";
import SketchFrame from "./SketchFrame.vue";

interface Props {
	preview: BlockPreview;
	reference: ReferenceView | null;
}

interface TabItem {
	value: string;
	label: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const { t } = useChatI18n();
const previewComponent = useBlockPreviewComponent();

const MODAL_UI = { content: "sm:max-w-5xl" };

const activeTab = ref<string>(BLOCK_PREVIEW_MAIN_TAB);
const tabs = computed<BlockPreviewTab[]>(() => previewTabs(props.preview));
const tabItems = computed<TabItem[]>(() =>
	tabs.value.map((tab) => ({
		value: tab.value,
		label: tab.label ?? t("dms_ai.panel.preview.proposed"),
	})),
);
const activeView = computed<BlockPreviewTab>(
	() =>
		tabs.value.find((tab) => tab.value === activeTab.value) ?? tabs.value[0],
);
const paneCount = computed<number>(
	() =>
		[props.reference, activeView.value.tree, activeView.value.sketch].filter(
			(pane) => pane !== null && pane !== undefined,
		).length,
);
const sketchTitle = computed<string>(() =>
	t("dms_ai.panel.preview.sketch_frame", {
		caption: activeView.value.sketch?.caption ?? props.preview.title,
	}),
);
const mockupLabel = computed<string>(
	() => props.preview.reference?.caption ?? t("dms_ai.panel.preview.mockup"),
);

watch(open, (isOpen) => {
	if (isOpen) activeTab.value = BLOCK_PREVIEW_MAIN_TAB;
});
</script>

<template>
	<UModal
		v-model:open="open"
		:title="preview.title"
		:description="preview.description"
		:ui="MODAL_UI"
	>
		<template #body>
			<div class="dms-ai-chat-tokens bp-modal">
				<UTabs
					v-if="tabItems.length > 1"
					v-model="activeTab"
					:items="tabItems"
					:content="false"
					variant="link"
					size="sm"
					:aria-label="t('dms_ai.panel.preview.variants_aria')"
				/>
				<div class="bp-modal__panes" :class="{ 'is-split': paneCount > 1 }">
					<figure v-if="reference" class="bp-pane">
						<figcaption class="bp-pane__label">{{ mockupLabel }}</figcaption>
						<div class="bp-pane__paper">
							<img
								v-if="reference.kind === 'image'"
								:src="reference.src"
								:alt="mockupLabel"
								class="bp-pane__image"
							/>
							<div v-else-if="reference.kind === 'link'" class="bp-pane__note">
								<UIcon name="i-ph-image-broken" class="bp-pane__note-icon" />
								<p>{{ t("dms_ai.panel.preview.mockup_external") }}</p>
								<a
									:href="reference.href"
									target="_blank"
									rel="noopener noreferrer"
									class="bp-pane__link"
								>
									{{ t("dms_ai.panel.preview.mockup_open") }}
									<UIcon name="i-ph-arrow-square-out" />
								</a>
							</div>
							<div v-else class="bp-pane__note">
								<UIcon name="i-ph-image-broken" class="bp-pane__note-icon" />
								<p>
									{{
										t("dms_ai.panel.preview.mockup_missing", {
											name: reference.name,
										})
									}}
								</p>
							</div>
						</div>
					</figure>
					<section
						v-if="activeView.tree"
						class="bp-pane"
						:aria-label="t('dms_ai.panel.preview.dms_blocks')"
					>
						<span class="bp-pane__label">
							{{ t("dms_ai.panel.preview.dms_blocks") }}
						</span>
						<div class="bp-pane__stage">
							<component
								:is="previewComponent"
								v-if="previewComponent"
								:key="activeTab"
								:tree="activeView.tree"
							/>
							<div v-else class="bp-fallback">
								<p class="bp-fallback__title">
									<UIcon name="i-ph-info" />
									{{ t("dms_ai.panel.preview.fallback_title") }}
								</p>
								<p class="bp-fallback__body">
									{{ t("dms_ai.panel.preview.fallback_body") }}
								</p>
								<pre
									class="bp-fallback__json"
								><code>{{ formatTree(activeView.tree) }}</code></pre>
							</div>
						</div>
					</section>
					<section
						v-if="activeView.sketch"
						class="bp-pane bp-pane--sketch"
						:aria-label="t('dms_ai.panel.preview.custom_sketch')"
					>
						<span class="bp-pane__label bp-pane__label--sketch">
							<UIcon name="i-ph-pencil-simple-line" />
							{{ t("dms_ai.panel.preview.custom_sketch") }}
						</span>
						<div class="bp-pane__sketch">
							<SketchFrame
								:key="activeTab"
								:sketch="activeView.sketch"
								:title="sketchTitle"
							/>
							<p v-if="activeView.sketch.caption" class="bp-pane__caption">
								{{ activeView.sketch.caption }}
							</p>
						</div>
					</section>
				</div>
			</div>
		</template>
	</UModal>
</template>

<style scoped>
.bp-modal {
	display: grid;
	gap: 14px;
}

.bp-modal__panes {
	display: grid;
	gap: 14px;
}

.bp-modal__panes.is-split {
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	align-items: start;
}

.bp-pane {
	display: grid;
	grid-template-rows: auto 1fr;
	gap: 6px;
	min-width: 0;
	margin: 0;
}

.bp-pane__label {
	font: 600 10px var(--ai-font-mono);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ui-text-muted);
}

.bp-pane__paper,
.bp-pane__stage {
	min-height: 220px;
	max-height: 64vh;
	overflow: auto;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-md);
}

.bp-pane__paper {
	display: grid;
	place-items: center;
	padding: 12px;
	background: var(--ui-bg-muted);
}

.bp-pane__stage {
	padding: 16px;
	background-color: var(--ui-bg);
	background-image: radial-gradient(var(--ui-border) 1px, transparent 1px);
	background-size: 14px 14px;
}

.bp-pane__label--sketch {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	color: var(--ai);
}

.bp-pane__sketch {
	min-height: 220px;
	max-height: 64vh;
	overflow: auto;
	border: 1px dashed var(--ai-line);
	border-radius: var(--ai-radius-md);
	background: var(--ai-tint);
}

.bp-pane__sketch :deep(.sketch-frame__doc) {
	border-radius: calc(var(--ai-radius-md) - 1px) calc(var(--ai-radius-md) - 1px)
		0 0;
}

.bp-pane__caption {
	margin: 0;
	padding: 8px 12px;
	border-top: 1px dashed var(--ai-line);
	font-size: 12px;
	line-height: 1.45;
	color: var(--ui-text-muted);
}

.bp-pane__image {
	max-width: 100%;
	height: auto;
	border-radius: var(--ai-radius-sm);
}

.bp-pane__note {
	display: grid;
	justify-items: center;
	gap: 8px;
	max-width: 280px;
	font-size: 12.5px;
	line-height: 1.5;
	text-align: center;
	color: var(--ui-text-muted);
}

.bp-pane__note p {
	margin: 0;
}

.bp-pane__note-icon {
	width: 22px;
	height: 22px;
	color: var(--ui-text-dimmed);
}

.bp-pane__link {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-weight: 600;
	color: var(--ai);
}

.bp-fallback {
	display: grid;
	gap: 8px;
}

.bp-fallback p {
	margin: 0;
}

.bp-fallback__title {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	font-weight: 600;
	color: var(--ui-text-highlighted);
}

.bp-fallback__body {
	font-size: 12.5px;
	color: var(--ui-text-muted);
}

.bp-fallback__json {
	margin: 0;
	padding: 12px;
	overflow: auto;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
	background: var(--ui-bg-elevated);
	font: 500 11.5px/1.55 var(--ai-font-mono);
	color: var(--ui-text-toned);
}
</style>
