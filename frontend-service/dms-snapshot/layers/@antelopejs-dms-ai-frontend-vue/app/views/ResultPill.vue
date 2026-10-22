<script setup lang="ts">
import { computed } from "vue";
import { RESULT_TONES } from "./constants";
import type { ActivityResult } from "./types";

interface Props {
	result: ActivityResult;
	/** "3 errors", "Redirected to Builder". */
	detail?: string;
	/** The change set the call's edits landed in. */
	changeSetNumber?: number;
}

const props = defineProps<Props>();

const { t } = useI18n();

const label = computed(() => {
	if (props.result === "done" && props.changeSetNumber !== undefined) {
		return t("dms_ai.views.result.applied", { number: props.changeSetNumber });
	}
	const base = t(`dms_ai.views.result.${props.result}`);
	return props.detail ? `${base} · ${props.detail}` : base;
});
</script>

<template>
	<DmsStatusPill
		:label="label"
		:tone="RESULT_TONES[props.result] ?? 'neutral'"
	/>
</template>
