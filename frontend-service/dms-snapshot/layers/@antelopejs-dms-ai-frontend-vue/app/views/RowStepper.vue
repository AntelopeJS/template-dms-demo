<script setup lang="ts">
import type { RowNavigation } from "./types";

interface Props {
	navigation: RowNavigation;
}

const props = defineProps<Props>();

const { t } = useI18n();
</script>

<template>
	<div class="text-muted flex items-center justify-between gap-3 text-xs">
		<span class="font-mono tabular-nums">
			{{
				t("dms_ai.views.common.position", {
					index: props.navigation.index + 1,
					total: props.navigation.total,
				})
			}}
		</span>
		<span class="flex items-center gap-1">
			<UKbd value="K" />
			<UKbd value="J" />
			<UButton
				icon="i-ph-caret-up"
				color="neutral"
				variant="outline"
				size="xs"
				square
				:aria-label="t('dms_ai.views.common.previous')"
				:disabled="!props.navigation.hasPrev"
				@click="props.navigation.prev()"
			/>
			<UButton
				icon="i-ph-caret-down"
				color="neutral"
				variant="outline"
				size="xs"
				square
				:aria-label="t('dms_ai.views.common.next')"
				:disabled="!props.navigation.hasNext"
				@click="props.navigation.next()"
			/>
		</span>
	</div>
</template>
