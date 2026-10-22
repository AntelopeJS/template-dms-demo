<script setup lang="ts">
import { computed } from "vue";
import type { RequestFailure } from "./composables/useAiData";
import { useViewFormat } from "./composables/useViewFormat";

type UnavailableStateSize = "sm" | "md" | "lg";

interface Props {
	failure: RequestFailure;
	/** The server's message, shown for an unexpected error. */
	message?: string;
	size?: UnavailableStateSize;
}

const props = withDefaults(defineProps<Props>(), {
	message: "",
	size: "md",
});
const emit = defineEmits<{ retry: [] }>();

const { t } = useI18n();
const { serverMessage } = useViewFormat();

interface FailureCopy {
	icon: string;
	title: string;
	description: string;
}

const COPY: Record<RequestFailure, () => FailureCopy> = {
	unavailable: () => ({
		icon: "i-ph-plugs",
		title: t("dms_ai.views.unavailable.title"),
		description: t("dms_ai.views.unavailable.description"),
	}),
	error: () => ({
		icon: "i-ph-warning-circle",
		title: t("dms_ai.views.error.title"),
		description: props.message
			? serverMessage(props.message)
			: t("dms_ai.views.error.description"),
	}),
};

const copy = computed(() => COPY[props.failure]());
const actions = computed(() => [
	{
		label: t("dms_ai.views.common.retry"),
		icon: "i-ph-arrows-clockwise",
		color: "neutral" as const,
		variant: "outline" as const,
		onClick: () => emit("retry"),
	},
]);
</script>

<template>
	<DmsEmptyState
		variant="error"
		:size="props.size"
		:icon="copy.icon"
		:title="copy.title"
		:description="copy.description"
		:actions="actions"
	/>
</template>
