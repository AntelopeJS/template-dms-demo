<script setup lang="ts">
import { computed } from "vue";
import type { SkillRow } from "../views/types";
import { skillLook } from "../views/utils/skills";

interface Props {
	row: SkillRow;
	selected?: boolean;
	select?: (value?: boolean) => void;
	open?: () => void;
	actions?: object;
}

const props = withDefaults(defineProps<Props>(), {
	selected: false,
	select: undefined,
	open: undefined,
	actions: undefined,
});

const { t } = useI18n();

const look = computed(() => skillLook(props.row));
const badge = computed(() =>
	props.row.isShadowed
		? { label: t("dms_ai.views.skills.shadowed"), tone: "warning" as const }
		: {
				label: t(`dms_ai.views.skills.source.${props.row.source}`),
				tone: look.value.badgeTone,
			},
);
const uses = computed(() =>
	props.row.uses30d > 0
		? t(
				"dms_ai.views.skills.uses",
				{ count: props.row.uses30d },
				props.row.uses30d,
			)
		: t("dms_ai.views.skills.never_used"),
);
</script>

<template>
	<DmsRecordCard
		:icon="look.icon"
		:tone="look.tone"
		:title="props.row.name"
		:subtitle="props.row.origin"
		:description="props.row.description"
		:tags="props.row.tags"
		:meta="uses"
		:selected="props.selected"
		:muted="props.row.isShadowed"
		interactive
		@open="props.open?.()"
	>
		<!-- The aside slot replaces the badge: keep it and add the TableView
		selection checkbox, which a custom card has to draw itself. -->
		<template #aside>
			<div class="flex shrink-0 items-center gap-2">
				<DmsStatusPill
					:label="badge.label"
					:tone="badge.tone"
					dot="none"
					size="sm"
				/>
				<UCheckbox
					v-if="props.select"
					:model-value="props.selected"
					:aria-label="props.row.name"
					@click.stop
					@update:model-value="props.select?.(!!$event)"
				/>
			</div>
		</template>
	</DmsRecordCard>
</template>
