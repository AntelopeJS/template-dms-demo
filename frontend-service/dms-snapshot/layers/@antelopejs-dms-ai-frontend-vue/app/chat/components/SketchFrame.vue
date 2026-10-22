<script setup lang="ts">
import { computed, ref } from "vue";
import { useDashboardScheme } from "../composables/useDashboardScheme";
import { SKETCH_DEFAULT_HEIGHT_PX } from "../constants/sketch";
import type { PreviewSketch } from "../types/protocol";
import {
	buildSketchDocument,
	computedStyleReader,
	sketchTokensCss,
} from "../utils/sketch";

interface Props {
	sketch: PreviewSketch;
	title: string;
	/** Overrides the sketch's own height, e.g. for a thumbnail. */
	height?: number;
}

const props = defineProps<Props>();
const host = ref<HTMLElement | null>(null);
const { scheme, revision } = useDashboardScheme();

const frameHeight = computed<string>(
	() => `${props.height ?? props.sketch.height ?? SKETCH_DEFAULT_HEIGHT_PX}px`,
);

const srcdoc = computed<string>(() => {
	if (revision.value === 0 || host.value === null) return "";
	const tokens = sketchTokensCss(scheme.value, computedStyleReader(host.value));
	return buildSketchDocument(props.sketch, tokens);
});
</script>

<template>
	<div ref="host" class="sketch-frame">
		<iframe
			v-if="srcdoc"
			class="sketch-frame__doc"
			sandbox=""
			referrerpolicy="no-referrer"
			:title="title"
			:srcdoc="srcdoc"
			:style="{ height: frameHeight }"
		/>
	</div>
</template>

<style scoped>
.sketch-frame {
	display: block;
	width: 100%;
}

.sketch-frame__doc {
	display: block;
	width: 100%;
	border: 0;
}
</style>
