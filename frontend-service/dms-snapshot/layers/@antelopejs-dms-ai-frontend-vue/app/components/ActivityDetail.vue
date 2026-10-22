<script setup lang="ts">
import { computed, ref } from "vue";
import DecisionLabel from "../views/DecisionLabel.vue";
import DiffView from "../views/DiffView.vue";
import RowStepper from "../views/RowStepper.vue";
import ResultPill from "../views/ResultPill.vue";
import UnavailableState from "../views/UnavailableState.vue";
import { useAiData } from "../views/composables/useAiData";
import { useAssistant } from "../views/composables/useAssistant";
import { useViewFormat } from "../views/composables/useViewFormat";
import { AI_PAGES, AI_ROUTES, CHANGE_SET_QUERY_KEY } from "../views/constants";
import type {
	ActivityDetailPayload,
	ActivityRow,
	RowNavigation,
} from "../views/types";
import {
	activityOutput,
	argumentItems,
	rawActivityJson,
} from "../views/utils/activity";
import { toDiffFiles } from "../views/utils/diff";
import { toolIcon, toolSource } from "../views/utils/tools";

interface Props {
	rowData?: ActivityRow;
	navigation?: RowNavigation;
}

const props = defineProps<Props>();

const { t } = useI18n();
const { moment, toolLabel, clock } = useViewFormat();
const assistant = useAssistant();
const isRawShown = ref(false);

const OUTPUT_MAX_LINES = 14;
const RAW_MAX_LINES = 20;

const rowId = computed(() => props.rowData?.id ?? props.rowData?._id);
// Read with the page: a deep link (`?record=<id>`) renders the entry on the
// server and hands it over. The drawer opened again shows the entry read
// before and reads it again, as a pending call may have ended since.
const detail = useAiData<ActivityDetailPayload>(() =>
	rowId.value
		? `${AI_ROUTES.activity}/${encodeURIComponent(rowId.value)}`
		: null,
);

function load(): void {
	void detail.refresh();
}

const row = computed(() => props.rowData);
const eyebrow = computed(() => {
	const current = row.value;
	if (!current) return "";
	const source = t(`dms_ai.views.source.${toolSource(current.tool)}`);
	return `${source} · ${moment(current.timestampMs, true)}`;
});
const heading = computed(() => {
	const current = row.value;
	if (!current) return "";
	const label = toolLabel(current.tool);
	return current.target ? `${label} · ${current.target}` : label;
});

const facts = computed(() => [
	{ id: "allowed", label: t("dms_ai.views.activity.allowed") },
	{ id: "result", label: t("dms_ai.views.activity.result") },
]);

const args = computed(() => argumentItems(detail.data.value?.args));
const diffFiles = computed(() => toDiffFiles(detail.data.value?.diff ?? []));
const trail = computed(() => detail.data.value?.decisionTrail ?? []);
const output = computed(() => activityOutput(detail.data.value));
const rawJson = computed(() => rawActivityJson(row.value, detail.data.value));

function viewChangeSet(): void {
	const id = row.value?.changeSetId;
	if (!id) return;
	const query = new URLSearchParams({ [CHANGE_SET_QUERY_KEY]: id });
	assistant.goTo(`${AI_PAGES.changes}?${query.toString()}`);
}

function openConversation(): void {
	if (row.value) assistant.openConversation(row.value.conversationId);
}
</script>

<template>
	<div v-if="row" class="flex min-h-full flex-col gap-5">
		<RowStepper v-if="props.navigation" :navigation="props.navigation" />

		<header class="flex items-start gap-3">
			<DmsIconWell :icon="toolIcon(row.tool)" tone="neutral" size="lg" />
			<div class="min-w-0 flex-1">
				<p
					class="text-dimmed font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]"
				>
					{{ eyebrow }}
				</p>
				<h3 class="text-highlighted mt-1 text-[17px] font-[650] leading-snug">
					{{ heading }}
				</h3>
			</div>
		</header>

		<DmsKeyValueList :items="facts">
			<template #value="{ item }">
				<DecisionLabel
					v-if="item.id === 'allowed'"
					:allowed-by="row.allowedBy"
				/>
				<ResultPill
					v-else
					:result="row.result"
					:detail="row.resultDetail"
					:change-set-number="row.changeSetNumber"
				/>
			</template>
		</DmsKeyValueList>

		<UnavailableState
			v-if="detail.failure.value"
			:failure="detail.failure.value"
			:message="detail.message.value"
			size="sm"
			@retry="load"
		/>
		<div
			v-else-if="!detail.data.value"
			class="flex flex-col gap-3"
			:aria-busy="true"
			:aria-label="t('dms_ai.views.common.loading')"
		>
			<USkeleton class="h-3 w-24" />
			<USkeleton class="h-24 w-full" />
			<USkeleton class="h-32 w-full" />
		</div>
		<template v-else>
			<section v-if="args.length > 0" class="flex flex-col gap-2">
				<DmsEyebrow :label="t('dms_ai.views.activity.arguments')" />
				<div class="border-default bg-(--dms-bg-field) rounded-md border px-3">
					<DmsKeyValueList :items="args" dense />
				</div>
			</section>

			<section v-if="trail.length > 0" class="flex flex-col gap-2">
				<DmsEyebrow :label="t('dms_ai.views.activity.decision_trail')" />
				<ol class="flex flex-col">
					<li
						v-for="(step, index) in trail"
						:key="index"
						class="border-muted flex items-baseline gap-3 border-s-2 py-1 ps-3 text-[13px]"
					>
						<span class="text-dimmed font-mono text-[11.5px] tabular-nums">
							{{ clock(step.atMs) }}
						</span>
						<span class="text-toned">{{ step.label }}</span>
					</li>
				</ol>
			</section>

			<section v-if="diffFiles.length > 0" class="flex flex-col gap-2">
				<DmsEyebrow :label="t('dms_ai.views.activity.diff')" />
				<DiffView :files="diffFiles" />
			</section>

			<section v-if="output" class="flex flex-col gap-2">
				<DmsEyebrow :label="t('dms_ai.views.activity.output')" />
				<DmsCodeSnippet
					:code="output"
					language="text"
					:max-lines="OUTPUT_MAX_LINES"
					wrap
				/>
			</section>

			<div class="flex flex-col gap-2">
				<UButton
					class="self-start"
					icon="i-ph-brackets-curly"
					color="neutral"
					variant="ghost"
					size="xs"
					:aria-expanded="isRawShown"
					:label="
						t(
							isRawShown
								? 'dms_ai.views.activity.hide_raw'
								: 'dms_ai.views.activity.show_raw',
						)
					"
					@click="isRawShown = !isRawShown"
				/>
				<DmsCodeSnippet
					v-if="isRawShown"
					:code="rawJson"
					language="json"
					:max-lines="RAW_MAX_LINES"
				/>
			</div>
		</template>

		<footer
			v-if="assistant.isAvailable || row.changeSetId"
			class="border-default bg-default sticky bottom-0 mt-auto flex flex-wrap justify-end gap-2 border-t pt-4"
		>
			<UButton
				v-if="assistant.isAvailable"
				icon="i-ph-chats-circle"
				color="neutral"
				variant="outline"
				:label="t('dms_ai.views.activity.open_conversation')"
				@click="openConversation"
			/>
			<UButton
				v-if="row.changeSetId"
				icon="i-ph-git-diff"
				color="secondary"
				:label="
					row.changeSetNumber !== undefined
						? t('dms_ai.views.activity.view_change_set_number', {
								number: row.changeSetNumber,
							})
						: t('dms_ai.views.activity.view_change_set')
				"
				@click="viewChangeSet"
			/>
		</footer>
	</div>
</template>
