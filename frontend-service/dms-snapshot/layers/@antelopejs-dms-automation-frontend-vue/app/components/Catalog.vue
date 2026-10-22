<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { NodeKindEntry, PortRef } from '../composables/useAutomationNodeKinds'
import type { JsonSchema } from '../composables/useGraphConnect'

// One catalog of the library (triggers, actions, data nodes, or the flow and
// helper blocks): its entries grouped by the module that registered them, and
// the picked one's detail — where it is used first, then what disabling it
// does, its settings, inputs and outputs as tables. The picked entry is kept
// in the URL (`?item=`), so going back to the library lands on it again.

type CatalogKind = 'triggers' | 'actions' | 'dataNodes' | 'flow'

interface CatalogEntry {
	id: string
	name: string
	description?: string
	icon?: string
	module?: string
	category?: string
	cluster?: 'replicated' | 'singleton'
	configSchema?: JsonSchema
	inputSchema?: JsonSchema
	outputSchema?: JsonSchema
	enabled?: boolean
}

type ProcedureState = 'failing' | 'degraded' | 'healthy' | 'paused' | 'draft'

interface TypeUsage {
	procedureId: string
	procedureName: string
	enabled: boolean
	state: ProcedureState
	nodeId: string
	nodeLabel: string | null
	groupPath: string[]
	groupLabel: string | null
	viaTemplate: { id: string; name: string } | null
	method?: string
	path?: string
	cron?: string
	timeZone?: string
	/** The schedule in words, by the server. */
	cronText?: BlockText
}

const props = defineProps<{
	kind: CatalogKind
	apiUrl: string
	builderUrl: string
}>()

const ENDPOINTS: Record<CatalogKind, string> = {
	triggers: 'trigger-types',
	actions: 'action-types',
	dataNodes: 'data-node-types',
	flow: 'node-kinds',
}

/** The palette categories the Flow catalog lists. */
const FLOW_CATEGORIES = ['flow', 'helper']

const STATE_TONES = {
	failing: 'error',
	degraded: 'warning',
	healthy: 'success',
	paused: 'neutral',
	draft: 'info',
} as const

// Procedures needing attention first.
const STATE_ORDER: ProcedureState[] = ['failing', 'degraded', 'healthy', 'paused', 'draft']

/** Procedures listed under "Used by" before "Show all". */
const USES_SHOWN = 8

const { $authFetch } = useAuthFetch()
const { processI18n } = useTranslation()
const { processText } = useComposedText()
const { t, te } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()
const route = useDmsRoute()
const router = useDmsRouter()

// The catalog and where its entries are used, read with the page.
const listRead = useApiData<CatalogEntry[] | NodeKindEntry[]>(`${props.apiUrl}/${ENDPOINTS[props.kind]}`)
const usageRead = useApiData<Record<string, TypeUsage[]>>(`${props.apiUrl}/library/usage/${props.kind}`)
const usage = computed(() => usageRead.data.value ?? {})
const loading = computed(() => listRead.pending.value || usageRead.pending.value)
const error = computed(() => {
	const failure = listRead.error.value ?? usageRead.error.value
	return failure ? describeApiError(failure) : null
})
// The entry picked in this view, else the URL's (`?item=`).
const picked = ref<string | null>(null)
const query = ref('')
const saving = ref(false)
const showAllUses = ref(false)
const detail = useTemplateRef<HTMLElement>('detail')
const list = useTemplateRef<HTMLElement>('list')

const configurable = computed(() => props.kind === 'triggers' || props.kind === 'actions')

function portsSchema(ports: PortRef[] | undefined): JsonSchema | undefined {
	if (!ports?.length) return undefined
	return { properties: Object.fromEntries(ports.map((p) => [p.name, { type: p.type }])) }
}

function flowEntries(kinds: NodeKindEntry[]): CatalogEntry[] {
	return kinds.flatMap(({ kind, meta: { ui } }) => {
		if (!ui?.category || !FLOW_CATEGORIES.includes(ui.category)) return []
		const descriptionKey = `dms_automation.library.flowBlocks.${kind}`
		return [
			{
				id: kind,
				name: ui.label,
				icon: ui.icon,
				category: ui.category,
				description: te(descriptionKey) ? t(descriptionKey) : undefined,
				configSchema: ui.configSchema,
				inputSchema: portsSchema(ui.staticDataIns),
				outputSchema: portsSchema(ui.staticDataOuts),
			},
		]
	})
}

function queryItem(): string | null {
	const q = route.query.item
	return typeof q === 'string' && q ? q : null
}

const entries = computed<CatalogEntry[]>(() => {
	const listed = listRead.data.value ?? []
	return props.kind === 'flow' ? flowEntries(listed as NodeKindEntry[]) : (listed as CatalogEntry[])
})

function load() {
	void Promise.all([listRead.refresh(), usageRead.refresh()])
}

/** Shows a write at once: the catalog's data is replaced, never changed in place. */
function replaceEntry(id: string, change: Partial<CatalogEntry>) {
	const listed = listRead.data.value
	if (!listed || props.kind === 'flow') return
	listRead.data.value = (listed as CatalogEntry[]).map((entry) => (entry.id === id ? { ...entry, ...change } : entry))
}

/**
 * The heading an entry is listed under: its module (built-in first), and for
 * data nodes and flow blocks their category within it.
 */
function groupOf(entry: CatalogEntry): string {
	if (props.kind === 'flow') return processI18n(`$dms_automation.builder.palette.groups.${entry.category}`)
	const module = entry.module ?? t('dms_automation.library.builtIn')
	if (props.kind !== 'dataNodes') return module
	return `${module} · ${categoryLabel(entry.category)}`
}

function categoryLabel(category: string | undefined): string {
	if (!category) return t('dms_automation.library.other')
	const key = `dms_automation.types.dataCategories.${category}`
	return te(key) ? t(key) : category
}

const groups = computed(() => {
	const q = query.value.trim().toLowerCase()
	const visible = entries.value.filter(
		(e) =>
			!q ||
			[e.id, processI18n(e.name), processI18n(e.description ?? ''), groupOf(e), e.module ?? '', e.category ?? ''].some((text) =>
				text.toLowerCase().includes(q),
			),
	)
	const map = new Map<string, CatalogEntry[]>()
	for (const entry of visible) {
		const group = groupOf(entry)
		map.set(group, [...(map.get(group) ?? []), entry])
	}
	const builtIn = t('dms_automation.library.builtIn')
	const rank = (group: string) => (group.startsWith(builtIn) ? 0 : 1)
	return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
})

/** The entry whose detail is shown: the one picked, else the first listed. */
const selectedId = computed<string | null>(() => {
	const wanted = picked.value ?? queryItem()
	return entries.value.some((e) => e.id === wanted) ? wanted : (groups.value[0]?.[1][0]?.id ?? null)
})

// A search hiding the picked entry moves the detail to the first one shown.
watch(groups, (shown) => {
	if (loading.value || shown.length === 0) return
	if (!shown.some(([, items]) => items.some((e) => e.id === selectedId.value))) {
		picked.value = shown[0]![1][0]!.id
	}
})

const selected = computed(() => entries.value.find((e) => e.id === selectedId.value) ?? null)

watch(selectedId, (id) => {
	showAllUses.value = false
	if (id && id !== queryItem()) void router.replace({ query: { ...route.query, item: id } })
})

/** Below the two-column width the detail sits under the list: bring it into view. */
async function select(id: string) {
	picked.value = id
	await nextTick()
	if (detail.value && list.value && detail.value.offsetTop > list.value.offsetTop) {
		detail.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}
}

function backToList() {
	list.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const uses = computed(() => (selected.value ? (usage.value[selected.value.id] ?? []) : []))
const enabledUses = computed(() => new Set(uses.value.filter((u) => u.enabled).map((u) => u.procedureId)).size)

/** "Used by", one line per procedure with the nodes placing the entry under it, by state then name. */
const procedureUses = computed(() => {
	const byProcedure = new Map<string, TypeUsage[]>()
	for (const use of uses.value) byProcedure.set(use.procedureId, [...(byProcedure.get(use.procedureId) ?? []), use])
	return [...byProcedure.values()].sort(
		([a], [b]) => STATE_ORDER.indexOf(a!.state) - STATE_ORDER.indexOf(b!.state) || a!.procedureName.localeCompare(b!.procedureName),
	)
})
const shownProcedureUses = computed(() => (showAllUses.value ? procedureUses.value : procedureUses.value.slice(0, USES_SHOWN)))

function useCount(id: string): number {
	return new Set((usage.value[id] ?? []).map((u) => u.procedureId)).size
}

const settingsSchema = computed(() => (props.kind === 'actions' ? selected.value?.inputSchema : selected.value?.configSchema))
const inputSchema = computed(() => (props.kind === 'dataNodes' || props.kind === 'flow' ? selected.value?.inputSchema : undefined))

async function setEnabled(enabled: boolean) {
	const entry = selected.value
	if (!entry) return
	saving.value = true
	try {
		await $authFetch(`${props.apiUrl}/${ENDPOINTS[props.kind]}/${encodeURIComponent(entry.id)}/config`, {
			method: 'PUT',
			body: { enabled },
		})
		replaceEntry(entry.id, { enabled })
		toast.add({
			title: t(enabled ? 'dms_automation.library.enabledToast' : 'dms_automation.library.disabledToast', {
				name: processI18n(entry.name),
			}),
			color: 'success',
			icon: 'i-ph-check-circle',
		})
	} catch (e) {
		toast.add({ title: t('dms_automation.common.actionFailed'), description: describeApiError(e), color: 'error', icon: 'i-ph-warning' })
	} finally {
		saving.value = false
	}
}

async function toggleEnabled(enabled: boolean) {
	const entry = selected.value
	if (!entry) return
	if (!enabled && enabledUses.value > 0) {
		const ok = await confirm({
			title: t('dms_automation.library.disableTitle', { name: processI18n(entry.name) }),
			description: t('dms_automation.library.disableImpact', { count: enabledUses.value }),
			color: 'warning',
			confirmLabel: t('dms_automation.library.disable'),
		})
		if (!ok) return
	}
	await setEnabled(enabled)
}

/** Which node of the procedure it is: its label, else the block's name, and where it sits. */
function where(use: TypeUsage): string {
	if (use.cronText) return processText(use.cronText)
	const node = use.nodeLabel ?? processI18n(selected.value?.name ?? '')
	if (use.viaTemplate) return `${node} · ${t('dms_automation.library.viaTemplate', { name: use.viaTemplate.name })}`
	if (use.groupPath.length === 0) return node
	const group = use.groupLabel
		? t('dms_automation.library.inGroup', { name: use.groupLabel })
		: t('dms_automation.library.inUnnamedGroup')
	return `${node} · ${group}`
}

function open(use: TypeUsage) {
	const path = use.groupPath.length ? `&path=${use.groupPath.map(encodeURIComponent).join(',')}` : ''
	void router.push(`${props.builderUrl}?selected=${use.procedureId}&node=${encodeURIComponent(use.nodeId)}${path}`)
}
</script>

<template>
	<div class="@container">
		<div class="grid grid-cols-1 items-start gap-5 @5xl:grid-cols-[20rem_minmax(0,1fr)]">
			<div ref="list" class="dms-card flex flex-col gap-2 p-2">
				<DmsSearchInput
					v-model="query"
					size="sm"
					:placeholder="$t('dms_automation.library.search')"
					class="w-full"
				/>
				<div v-if="loading && entries.length === 0" class="flex flex-col gap-2 p-1">
					<USkeleton v-for="i in 4" :key="i" class="h-12 w-full" />
				</div>
				<DmsEmptyState
					v-else-if="error"
					size="sm"
					variant="error"
					:title="$t('dms_automation.library.loadError')"
					:description="error"
					:actions="[{ label: $t('dms_automation.common.retry'), onClick: load }]"
				/>
				<template v-else>
					<div v-for="[group, items] in groups" :key="group" class="flex flex-col gap-1">
						<p class="px-2.5 pt-2 pb-0.5 font-mono text-[10px] tracking-widest text-dimmed uppercase">{{ group }}</p>
						<button
							v-for="entry in items"
							:key="entry.id"
							type="button"
							class="flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors"
							:class="entry.id === selectedId ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-elevated'"
							:aria-current="entry.id === selectedId ? 'true' : undefined"
							@click="select(entry.id)"
						>
							<UIcon :name="entry.icon || 'i-ph-cube'" class="mt-0.5 size-4 shrink-0 text-muted" />
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="flex items-center gap-2">
									<span class="truncate text-sm font-medium text-highlighted">{{ processI18n(entry.name) }}</span>
									<UBadge v-if="entry.enabled === false" size="sm" color="neutral" variant="subtle">
										{{ $t('dms_automation.library.off') }}
									</UBadge>
								</span>
								<span v-if="entry.description" class="truncate text-xs text-muted">{{ processI18n(entry.description) }}</span>
							</span>
							<span class="shrink-0 font-mono text-[11px] text-dimmed">
								{{ $t('dms_automation.library.uses', { count: useCount(entry.id) }) }}
							</span>
						</button>
					</div>
					<p v-if="groups.length === 0" class="p-3 text-center text-xs text-dimmed">{{ $t('dms_automation.library.noMatch') }}</p>
				</template>
			</div>

			<div v-if="selected" ref="detail" class="flex scroll-mt-4 flex-col gap-4">
				<UButton
					class="self-start @5xl:hidden"
					size="sm"
					variant="ghost"
					color="neutral"
					icon="i-ph-arrow-up"
					@click="backToList"
				>
					{{ $t('dms_automation.library.backToList') }}
				</UButton>
				<DmsCard>
					<div class="flex flex-wrap items-start gap-4">
						<DmsIconWell :icon="selected.icon || 'i-ph-cube'" tone="primary" size="xl" />
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<div class="flex flex-wrap items-center gap-2">
								<h2 class="text-lg font-semibold text-highlighted">{{ processI18n(selected.name) }}</h2>
								<UBadge size="sm" color="neutral" variant="outline">{{ groupOf(selected) }}</UBadge>
							</div>
							<p v-if="selected.description" class="text-sm text-muted">{{ processI18n(selected.description) }}</p>
							<p class="font-mono text-xs break-all text-dimmed">
								id · {{ selected.id }}
								<template v-if="selected.cluster"> · cluster · {{ selected.cluster }}</template>
							</p>
						</div>
						<div v-if="configurable" class="flex items-center gap-2">
							<span class="text-sm text-muted" aria-hidden="true">
								{{ selected.enabled !== false ? $t('dms_automation.library.enabled') : $t('dms_automation.library.disabled') }}
							</span>
							<USwitch
								:model-value="selected.enabled !== false"
								:loading="saving"
								:aria-label="$t('dms_automation.library.switchLabel', { name: processI18n(selected.name) })"
								@update:model-value="toggleEnabled"
							/>
						</div>
					</div>
					<p v-if="kind === 'flow'" class="mt-3 text-xs text-muted">{{ $t('dms_automation.library.flowAlwaysOn') }}</p>
				</DmsCard>

				<DmsCard :title="$t('dms_automation.library.usedBy')" :count="procedureUses.length">
					<p v-if="configurable && enabledUses > 0" class="mb-3 text-xs text-muted">
						{{ $t('dms_automation.library.disableImpact', { count: enabledUses }) }}
					</p>
					<ul v-if="procedureUses.length" class="divide-y divide-default">
						<li v-for="nodes in shownProcedureUses" :key="nodes[0]!.procedureId" class="flex items-start gap-3 py-2">
							<DmsStatusPill
								:tone="STATE_TONES[nodes[0]!.state]"
								:label="$t(`dms_automation.procedures.status.${nodes[0]!.state}`)"
								size="sm"
								class="mt-0.5"
							/>
							<div class="flex min-w-0 flex-1 flex-col">
								<span class="truncate text-sm text-highlighted">{{ nodes[0]!.procedureName }}</span>
								<div v-for="use in nodes" :key="`${use.nodeId}-${use.groupPath.join('/')}`" class="flex min-w-0 items-center gap-2">
									<DmsAutomationWebhookEndpoint
										v-if="use.path"
										class="flex-1"
										compact
										:path="use.path"
										:method="use.method"
										:api-url="apiUrl"
									/>
									<span v-else class="min-w-0 flex-1 truncate text-xs text-muted">{{ where(use) }}</span>
									<UButton size="xs" variant="ghost" color="neutral" trailing-icon="i-ph-arrow-up-right" @click="open(use)">
										{{ $t('dms_automation.library.open') }}
									</UButton>
								</div>
							</div>
						</li>
					</ul>
					<p v-else class="text-xs text-dimmed">{{ $t('dms_automation.library.unused') }}</p>
					<UButton
						v-if="procedureUses.length > USES_SHOWN"
						class="mt-2"
						size="xs"
						variant="ghost"
						color="neutral"
						:trailing-icon="showAllUses ? 'i-ph-caret-up' : 'i-ph-caret-down'"
						@click="showAllUses = !showAllUses"
					>
						{{ showAllUses ? $t('dms_automation.library.showLess') : $t('dms_automation.library.showAll', { count: procedureUses.length }) }}
					</UButton>
				</DmsCard>

				<DmsCard v-if="settingsSchema" :title="kind === 'actions' ? $t('dms_automation.library.inputs') : $t('dms_automation.library.settings')">
					<p class="mb-3 text-xs text-muted">{{ $t('dms_automation.library.settingsHint') }}</p>
					<DmsAutomationSchemaTable :schema="settingsSchema" />
				</DmsCard>

				<DmsCard v-if="inputSchema" :title="$t('dms_automation.library.inputs')">
					<DmsAutomationSchemaTable :schema="inputSchema" />
				</DmsCard>

				<DmsCard :title="$t('dms_automation.library.outputs')">
					<DmsAutomationSchemaTable :schema="selected.outputSchema" />
				</DmsCard>

				<DmsBanner
					v-if="selected.cluster"
					size="sm"
					tone="info"
					icon="i-ph-hard-drives"
					:title="$t(`dms_automation.library.cluster.${selected.cluster}`)"
					:description="$t(`dms_automation.library.cluster.${selected.cluster}Hint`)"
				/>
			</div>
			<DmsEmptyState
				v-else-if="!loading && !error"
				:title="$t('dms_automation.library.nothingSelected')"
				:description="$t('dms_automation.library.nothingSelectedHint')"
			/>
		</div>
	</div>
</template>
