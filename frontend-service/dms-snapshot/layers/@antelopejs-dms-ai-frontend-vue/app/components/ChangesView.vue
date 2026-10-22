<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDmsRoute } from "#dms/frontend-module";
import ChangeSetPanel from "../views/ChangeSetPanel.vue";
import UnavailableState from "../views/UnavailableState.vue";
import { useAiData, useAiPagedData } from "../views/composables/useAiData";
import { useAssistant } from "../views/composables/useAssistant";
import { useViewFormat } from "../views/composables/useViewFormat";
import {
	AI_ROUTES,
	CHANGE_SET_QUERY_KEY,
	CHANGES_PAGE_SIZE,
} from "../views/constants";
import type {
	AssistantStatus,
	ChangeSetSummary,
	ListPayload,
	ScopeId,
} from "../views/types";
import {
	changeSetIcon,
	matchesSearch,
	writeSelectedSet,
} from "../views/utils/change-sets";

type ScopeFilter = ScopeId | "all";

const { t } = useI18n();
const { moment } = useViewFormat();
const assistant = useAssistant();
const route = useDmsRoute();

const scope = ref<ScopeFilter>("all");
const search = ref("");

function listQuery(offset: number): Record<string, string | number> {
	const query: Record<string, string | number> = {
		offset,
		limit: CHANGES_PAGE_SIZE,
	};
	if (scope.value === "all") return query;
	return { ...query, scope: scope.value, filter_scope: `is:${scope.value}` };
}

type ChangesPage = ListPayload<ChangeSetSummary>;

/** The sets the pages hold, in order. */
function loadedCount(pages: ChangesPage[]): number {
	return pages.reduce((count, page) => count + page.results.length, 0);
}

// The status and the list's first page are read with the page: a server
// render shows them, and the selected set's panel, at once. "Load more"
// appends a page under the scope's key; the page's refreshes read every
// page loaded again.
const status = useAiData<AssistantStatus>(AI_ROUTES.status);
const list = useAiPagedData<ChangesPage, number>(
	() => `dms-ai:changes:${scope.value}`,
	({ $authFetch, cursor, signal }) =>
		$authFetch<ChangesPage>(AI_ROUTES.changes, {
			query: listQuery(cursor ?? 0),
			signal,
		}),
	{
		nextCursor: (page, pages) => {
			const loaded = loadedCount(pages);
			return page.results.length > 0 && loaded < page.total ? loaded : null;
		},
	},
);
const changeSets = computed(() =>
	list.pages.value.flatMap((page) => page.results),
);
const total = computed(() => list.pages.value.at(-1)?.total ?? 0);

function selectedFromRoute(): string | undefined {
	const id = route.query[CHANGE_SET_QUERY_KEY];
	return typeof id === "string" && id ? id : undefined;
}

/** The set picked here or named by the URL (`?set=`); the first one until then. */
const pickedId = ref<string | undefined>(selectedFromRoute());
const selectedId = computed(() => pickedId.value ?? changeSets.value[0]?.id);

const SCOPE_ITEMS = computed(() => [
	{ value: "all", label: t("dms_ai.views.changes.filter_all") },
	{ value: "safe", label: t("dms_ai.views.changes.filter_safe") },
	{ value: "vibe", label: t("dms_ai.views.changes.filter_code") },
]);

function reload(): Promise<void> {
	return list.refresh();
}

/** Appends the next page; a failure keeps the sets listed and the button. */
function loadMore(): Promise<void> {
	return list.loadMore();
}

watch(selectedFromRoute, (id) => {
	if (id) pickedId.value = id;
});

function select(id: string | number | undefined): void {
	if (id === undefined) return;
	pickedId.value = String(id);
	writeSelectedSet(pickedId.value);
}

function sublabel(set: ChangeSetSummary): string {
	if (set.state === "undone") {
		const parts = [`#${set.number}`, t("dms_ai.views.changes.undone")];
		if (set.stateChangedAtMs) parts.push(moment(set.stateChangedAtMs));
		if (set.stateChangedBy) parts.push(set.stateChangedBy);
		return parts.join(" · ");
	}
	const parts = [
		`#${set.number}`,
		moment(set.createdAtMs),
		`+${set.added} −${set.removed}`,
		t(`dms_ai.views.scope.${set.scope}`),
	];
	if (set.isAutoFix) parts.push(t("dms_ai.views.changes.auto_fix"));
	return parts.join(" · ");
}

const visibleSets = computed(() =>
	changeSets.value.filter((set) => matchesSearch(set, search.value)),
);
const items = computed(() =>
	visibleSets.value.map((set) => ({
		value: set.id,
		label: set.title,
		sublabel: sublabel(set),
		icon: changeSetIcon(set),
	})),
);

const isCheckpointOff = computed(
	() => status.data.value?.checkpointsAvailable === false,
);
const isFirstLoad = computed(
	() =>
		changeSets.value.length === 0 &&
		(list.pending.value || list.status.value === "idle"),
);
const hasMore = computed(() => list.hasMore.value);
const listLabel = computed(() =>
	t("dms_ai.views.changes.list_label", { count: total.value }),
);
const emptyActions = computed(() =>
	assistant.isAvailable
		? [
				{
					label: t("dms_ai.views.common.open_assistant"),
					icon: "i-ph-sparkle",
					color: "secondary" as const,
					onClick: () => assistant.openPanel(),
				},
			]
		: [],
);
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<UInput
				v-model="search"
				icon="i-ph-magnifying-glass"
				size="sm"
				class="w-full sm:w-64"
				:placeholder="t('dms_ai.views.changes.search')"
				:aria-label="t('dms_ai.views.changes.search')"
			/>
			<DmsSegmented
				v-model="scope"
				:items="SCOPE_ITEMS"
				size="sm"
				:aria-label="t('dms_ai.views.changes.filter_label')"
			/>
		</div>

		<DmsCard v-if="isCheckpointOff" :padded="false">
			<DmsEmptyState
				icon="i-ph-git-diff"
				:title="t('dms_ai.views.changes.off_title')"
				:description="t('dms_ai.views.changes.off_description')"
			/>
		</DmsCard>
		<DmsCard
			v-else-if="list.failure.value && changeSets.length === 0"
			:padded="false"
		>
			<UnavailableState
				:failure="list.failure.value"
				:message="list.message.value"
				@retry="reload"
			/>
		</DmsCard>
		<div
			v-else-if="isFirstLoad"
			class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]"
			:aria-busy="true"
			:aria-label="t('dms_ai.views.common.loading')"
		>
			<DmsCard class="flex flex-col gap-4">
				<USkeleton v-for="index in 5" :key="index" class="h-10 w-full" />
			</DmsCard>
			<DmsCard class="flex flex-col gap-3">
				<USkeleton class="h-5 w-64" />
				<USkeleton class="h-48 w-full" />
			</DmsCard>
		</div>
		<DmsCard v-else-if="changeSets.length === 0" :padded="false">
			<DmsEmptyState
				icon="i-ph-git-diff"
				:title="t('dms_ai.views.changes.empty_title')"
				:description="t('dms_ai.views.changes.empty_description')"
				:actions="emptyActions"
			/>
		</DmsCard>
		<DmsCard v-else-if="items.length === 0" :padded="false">
			<DmsEmptyState
				variant="no-result"
				:title="t('dms_ai.views.changes.no_match_title')"
				:description="t('dms_ai.views.changes.no_match_description')"
			/>
		</DmsCard>
		<template v-else>
			<DmsMasterDetail
				:model-value="selectedId"
				:items="items"
				:list-label="listLabel"
				@update:model-value="select"
			>
				<ChangeSetPanel
					v-if="selectedId"
					:key="selectedId"
					:change-set-id="selectedId"
				/>
			</DmsMasterDetail>
			<div v-if="hasMore" class="flex lg:w-[380px] lg:justify-center">
				<UButton
					color="neutral"
					variant="outline"
					size="sm"
					icon="i-ph-caret-down"
					:loading="list.loadingMore.value"
					:label="t('dms_ai.views.common.load_more')"
					@click="loadMore"
				/>
			</div>
		</template>
	</div>
</template>
