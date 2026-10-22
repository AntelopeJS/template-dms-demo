<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../chat/utils/markdown";
import RowStepper from "../views/RowStepper.vue";
import { useAssistant } from "../views/composables/useAssistant";
import { useViewFormat } from "../views/composables/useViewFormat";
import type { RowNavigation, SkillRow } from "../views/types";
import { skillLook } from "../views/utils/skills";

interface Props {
	rowData?: SkillRow;
	navigation?: RowNavigation;
}

const props = defineProps<Props>();

const { t } = useI18n();
const { moment } = useViewFormat();
const assistant = useAssistant();

const skill = computed(() => props.rowData);
const look = computed(() => (skill.value ? skillLook(skill.value) : null));
const html = computed(() => renderMarkdown(skill.value?.body ?? ""));

const facts = computed(() => {
	const current = skill.value;
	if (!current || !look.value) return [];
	return [
		{
			id: "source",
			label: t("dms_ai.views.skills.source_label"),
			value: t(`dms_ai.views.skills.source.${current.source}`),
			type: "status" as const,
			tone: look.value.badgeTone,
		},
		{
			id: "origin",
			label: t("dms_ai.views.skills.origin_label"),
			value: current.origin,
			type: "mono" as const,
			copy: true,
		},
		{
			id: "used",
			label: t("dms_ai.views.skills.used_label"),
			value: t(
				"dms_ai.views.skills.used_value",
				{ count: current.uses30d },
				current.uses30d,
			),
		},
		{
			id: "last",
			label: t("dms_ai.views.skills.last_used_label"),
			value: current.lastUsedAtMs
				? moment(current.lastUsedAtMs)
				: t("dms_ai.views.skills.never_used"),
		},
	];
});

function openLastConversation(): void {
	const id = skill.value?.lastConversationId;
	if (id) assistant.openConversation(id);
}
</script>

<template>
	<div v-if="skill && look" class="flex min-h-full flex-col gap-5">
		<RowStepper v-if="props.navigation" :navigation="props.navigation" />

		<header class="flex items-start gap-3">
			<DmsIconWell :icon="look.icon" :tone="look.tone" size="lg" />
			<div class="min-w-0 flex-1">
				<h3
					class="text-highlighted truncate font-mono text-[15px] font-semibold"
				>
					{{ skill.name }}
				</h3>
				<p class="text-dimmed mt-0.5 truncate font-mono text-[11.5px]">
					{{ skill.qualifiedName }}
				</p>
			</div>
		</header>

		<DmsBanner
			v-if="skill.isShadowed"
			size="sm"
			tone="warning"
			:title="t('dms_ai.views.skills.shadowed')"
			:description="
				skill.shadowedBy
					? t('dms_ai.views.skills.shadowed_by', { winner: skill.shadowedBy })
					: t('dms_ai.views.skills.shadowed_description')
			"
		/>

		<DmsKeyValueList :items="facts" />

		<p class="text-muted text-[13px] leading-relaxed">
			{{ skill.description }}
		</p>

		<ul v-if="skill.tags.length > 0" class="flex flex-wrap gap-1.5">
			<li
				v-for="tag in skill.tags"
				:key="tag"
				class="bg-elevated text-toned rounded-[5px] px-1.5 py-0.5 text-[11.5px] font-medium"
			>
				{{ tag }}
			</li>
		</ul>

		<section class="flex flex-col gap-2">
			<div class="flex items-center justify-between gap-2">
				<DmsEyebrow label="SKILL.md" />
				<DmsCopyButton :value="skill.body" />
			</div>
			<div class="dms-ai-skill-doc dms-card p-4" v-html="html" />
		</section>

		<footer
			v-if="assistant.isAvailable && skill.lastConversationId"
			class="border-default bg-default sticky bottom-0 mt-auto flex justify-end border-t pt-4"
		>
			<UButton
				icon="i-ph-chats-circle"
				color="neutral"
				variant="outline"
				:label="t('dms_ai.views.skills.open_last_conversation')"
				@click="openLastConversation"
			/>
		</footer>
	</div>
</template>

<style scoped>
.dms-ai-skill-doc {
	font-size: 13px;
	line-height: 1.65;
	color: var(--ui-text-toned);
	overflow-wrap: anywhere;
}
.dms-ai-skill-doc :deep(:is(h1, h2, h3, h4, h5, h6)) {
	margin: 14px 0 6px;
	font-size: 13.5px;
	font-weight: 650;
	color: var(--ui-text-highlighted);
}
.dms-ai-skill-doc :deep(:first-child) {
	margin-top: 0;
}
.dms-ai-skill-doc :deep(p) {
	margin: 0 0 8px;
}
.dms-ai-skill-doc :deep(:is(ul, ol)) {
	margin: 0 0 8px;
	padding-left: 18px;
}
.dms-ai-skill-doc :deep(ul) {
	list-style: disc;
}
.dms-ai-skill-doc :deep(ol) {
	list-style: decimal;
}
.dms-ai-skill-doc :deep(code) {
	padding: 1px 5px;
	border-radius: 4px;
	background: var(--ui-bg-elevated);
	color: var(--ui-text-highlighted);
	font: 500 12px var(--font-mono, ui-monospace, monospace);
}
.dms-ai-skill-doc :deep(pre) {
	margin: 0 0 8px;
	padding: 10px 12px;
	overflow-x: auto;
	border-radius: 6px;
	background: var(--dms-bg-field);
}
.dms-ai-skill-doc :deep(pre code) {
	padding: 0;
	background: transparent;
}
.dms-ai-skill-doc :deep(a) {
	color: var(--ui-primary);
	text-decoration: underline;
}
</style>
