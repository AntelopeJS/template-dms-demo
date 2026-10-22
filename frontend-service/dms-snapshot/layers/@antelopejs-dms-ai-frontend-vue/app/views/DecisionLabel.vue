<script setup lang="ts">
import { computed } from "vue";
import { DECISION_STYLES } from "./constants";
import type { AllowedBy } from "./types";

interface Props {
	allowedBy: AllowedBy;
}

const props = defineProps<Props>();

const { t } = useI18n();

const style = computed(() => DECISION_STYLES[props.allowedBy]);
</script>

<template>
	<span
		class="text-muted inline-flex items-center gap-[5px] whitespace-nowrap text-xs font-[550]"
	>
		<UIcon
			v-if="style"
			:name="style.icon"
			class="size-3.5 shrink-0"
			:class="style.iconClass"
			:aria-hidden="true"
		/>
		{{ t(`dms_ai.views.allowed.${props.allowedBy}`) }}
	</span>
</template>
