<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { isIconName } from './IconPicker.vue'
import { queryString } from '../utils/automation'

// The library's templates: reusable groups other procedures place as linked
// blocks. The detail edits the name, icon and description, lists the ports
// (edited inside the graph) and where the template is used — procedures and
// other templates; deleting forks every usage into a local group so they keep
// working. The picked template is kept in the URL (`?template=`).

interface JsonSchema {
	type?: string | string[]
	[key: string]: unknown
}

interface TemplatePort {
	name: string
	kind: 'data' | 'trigger'
	direction: 'in' | 'out'
	schema?: JsonSchema
}

interface TemplateRow {
	_id: string
	name: string
	description: string
	icon: string
	ports: TemplatePort[]
	subgraph: unknown
	usageCount?: number
	updated_at?: string
}

interface TemplateUsage {
	procedureId: string
	nodeId: string
	groupPath: string[]
}

interface TemplateNesting {
	templateId: string
	nodeId: string
	groupPath: string[]
}

interface TemplateUsages {
	procedures: TemplateUsage[]
	templates: TemplateNesting[]
}

interface ProcedureSummary {
	procedureId: string
	name: string
	status: 'failing' | 'degraded' | 'healthy' | 'paused' | 'draft'
}

const props = defineProps<{
	apiUrl: string
	builderUrl: string
}>()

const DEFAULT_ICON = 'i-ph-package'
const STATE_TONES = {
	failing: 'error',
	degraded: 'warning',
	healthy: 'success',
	paused: 'neutral',
	draft: 'info',
} as const
const NO_USAGES: TemplateUsages = { procedures: [], templates: [] }

const { $authFetch } = useAuthFetch()
const route = useDmsRoute()
const router = useDmsRouter()
const toast = useToast()
const { t } = useI18n()
const { confirm } = useConfirm()

const search = ref('')
const detail = useTemplateRef<HTMLElement>('detail')
const list = useTemplateRef<HTMLElement>('list')

const formName = ref('')
const formDescription = ref('')
const formIcon = ref(DEFAULT_ICON)
const saving = ref(false)

function queryTemplate(): string | null {
	return queryString(route.query.template)
}

// The templates, and the state of the procedures placing them, read with
// the page.
const listRead = useApiData<{ results: TemplateRow[]; total: number }>(`${props.apiUrl}/templates`)
const summaryRead = useApiData<ProcedureSummary[]>(`${props.apiUrl}/procedures/summary`)
const items = computed(() => listRead.data.value?.results ?? [])
/** How many templates exist, when the server sent fewer than that. */
const total = computed(() => listRead.data.value?.total ?? 0)
const loading = computed(() => listRead.pending.value)
const loadError = computed(() => (listRead.error.value ? describeApiError(listRead.error.value) : null))
const procedures = computed(() => new Map((summaryRead.data.value ?? []).map((p) => [p.procedureId, p])))

function loadList() {
	void listRead.refresh()
}

/** Shows a write at once: the list's data is replaced, never changed in place. */
function replaceListed(change: (rows: TemplateRow[]) => TemplateRow[]) {
	const listed = listRead.data.value
	if (!listed) return
	const results = change(listed.results)
	listRead.data.value = { results, total: Math.max(0, listed.total + results.length - listed.results.length) }
}

const sortedItems = computed(() => [...items.value].sort((a, b) => a.name.localeCompare(b.name)))
// The template picked in this view, else the URL's (`?template=`).
const picked = ref<string | null>(null)
/** The template shown: the one picked, else the first by name. */
const selectedId = computed<string | null>(() => {
	const wanted = picked.value ?? queryTemplate()
	return items.value.some((x) => x._id === wanted) ? wanted : (sortedItems.value[0]?._id ?? null)
})
const selected = computed(() => items.value.find((x) => x._id === selectedId.value) ?? null)

// Where the template shown is used, read with it.
const usagesRead = useApiData<TemplateUsages>(() => (selectedId.value ? `${props.apiUrl}/templates/${selectedId.value}/usages` : null))
const usages = computed(() => (usagesRead.placeholder.value || usagesRead.error.value ? NO_USAGES : (usagesRead.data.value ?? NO_USAGES)))
const usagesLoading = computed(() => usagesRead.pending.value && (usagesRead.placeholder.value || !usagesRead.data.value))
const templateNames = computed(() => new Map(items.value.map((x) => [x._id, x.name])))

const filteredItems = computed(() => {
	const q = search.value.trim().toLowerCase()
	if (!q) return sortedItems.value
	return sortedItems.value.filter((x) => x.name.toLowerCase().includes(q) || (x.description ?? '').toLowerCase().includes(q))
})

// A malformed icon is said under the picker; it can't be saved.
const iconValid = computed(() => !formIcon.value || isIconName(formIcon.value))

const dirty = computed(() => {
	const s = selected.value
	if (!s) return false
	return formName.value !== s.name || formDescription.value !== (s.description ?? '') || formIcon.value !== (s.icon || DEFAULT_ICON)
})

// Picking another template, leaving the page or the tab asks before the
// form's unsaved changes are lost.
const form = useTemplateRef<HTMLElement>('form')
const { confirmLeave } = useUnsavedChanges({ dirty, element: form })

// The form starts from the template shown: awaited, the server renders it
// filled in, and the browser starts from the same values.
await listRead
watch(
	selected,
	(s) => {
		formName.value = s?.name ?? ''
		formDescription.value = s?.description ?? ''
		formIcon.value = s?.icon || DEFAULT_ICON
	},
	{ immediate: true },
)

watch(selectedId, (id) => {
	if (id && id !== queryTemplate()) void router.replace({ query: { ...route.query, template: id } })
})

async function select(id: string) {
	if (id === selectedId.value || !(await confirmLeave())) return
	picked.value = id
	// Below the two-column width the detail sits under the list: bring it into view.
	await nextTick()
	if (detail.value && list.value && detail.value.offsetTop > list.value.offsetTop) {
		detail.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}
}

function backToList() {
	list.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** One line per procedure or template placing it, with how many times. */
const usageRows = computed(() => {
	const rows = new Map<string, { kind: 'procedure' | 'template'; id: string; first: TemplateUsage | TemplateNesting; count: number }>()
	for (const usage of usages.value.procedures) {
		const row = rows.get(`p:${usage.procedureId}`)
		if (row) row.count++
		else rows.set(`p:${usage.procedureId}`, { kind: 'procedure', id: usage.procedureId, first: usage, count: 1 })
	}
	for (const nesting of usages.value.templates) {
		const row = rows.get(`t:${nesting.templateId}`)
		if (row) row.count++
		else rows.set(`t:${nesting.templateId}`, { kind: 'template', id: nesting.templateId, first: nesting, count: 1 })
	}
	return [...rows.values()]
})

const NAME_ID = 'template-name'
const NAME_MAX = 200
const DESCRIPTION_MAX = 2000
// A missing or taken name shows under its field; a refused save is a toast.
const fieldErrors = useFieldErrors({ fields: { name: NAME_ID } })
watch(formName, () => fieldErrors.clear('name'))

interface RefusalBody {
	code?: string
	error?: string
	issues?: { path?: (string | number)[]; message?: string }[]
}

/** The `code` a refused request answered with, if any. */
function errorCode(e: unknown): string | undefined {
	return (e as { data?: RefusalBody }).data?.code
}

/** What the server said was wrong, rather than the request's raw status line. */
function errorMessage(e: unknown): string {
	const body = (e as { data?: RefusalBody }).data
	const issues = body?.issues?.map((i) => (i.path?.length ? `${i.path.join('.')}: ${i.message}` : i.message)).filter(Boolean)
	return issues?.length ? issues.join(' · ') : (body?.error ?? describeApiError(e))
}

async function onSave() {
	const s = selected.value
	if (!s) return
	if (!formName.value.trim()) {
		await fieldErrors.setError('name', t('dms_automation.templates.form.nameRequired'))
		return
	}
	saving.value = true
	try {
		const updated = await $authFetch<TemplateRow>(`${props.apiUrl}/templates/${s._id}`, {
			method: 'PUT',
			body: {
				name: formName.value.trim(),
				description: formDescription.value,
				icon: formIcon.value || DEFAULT_ICON,
				ports: s.ports ?? [],
				subgraph: s.subgraph ?? { nodes: [], triggerEdges: [], dataEdges: [] },
			},
		})
		replaceListed((rows) => rows.map((x) => (x._id === s._id ? { ...s, ...updated, usageCount: s.usageCount } : x)))
		toast.add({ title: t('dms_automation.templates.saved', { name: updated.name }), color: 'success', icon: 'i-ph-check-circle' })
	} catch (e) {
		if (errorCode(e) === 'name-taken') {
			await fieldErrors.setError('name', t('dms_automation.templates.nameTaken'))
			return
		}
		toast.add({ title: t('dms_automation.templates.saveError'), description: errorMessage(e), color: 'error', icon: 'i-ph-warning' })
	} finally {
		saving.value = false
	}
}

function editGraph(id: string) {
	void router.push(`${props.builderUrl}?template=${id}`)
}

function openUsage(usage: TemplateUsage) {
	const path = usage.groupPath.length ? `&path=${usage.groupPath.map(encodeURIComponent).join(',')}` : ''
	void router.push(`${props.builderUrl}?selected=${usage.procedureId}&node=${encodeURIComponent(usage.nodeId)}${path}`)
}

async function onDelete() {
	const s = selected.value
	if (!s) return
	// Counted now, not when the list loaded: a usage added since is forked too.
	await usagesRead.refresh()
	const fresh = usagesRead.data.value
	if (usagesRead.error.value || !fresh) {
		toast.add({ title: t('dms_automation.templates.deleteError'), description: errorMessage(usagesRead.error.value), color: 'error', icon: 'i-ph-warning' })
		return
	}
	const count = fresh.procedures.length + fresh.templates.length
	const ok = await confirm({
		title: t('dms_automation.templates.deleteTitle', { name: s.name }),
		description: count > 0 ? t('dms_automation.templates.deleteForksIn', { owners: ownersOf(fresh), count }, count) : t('dms_automation.templates.unused'),
		color: 'error',
		icon: 'i-ph-trash',
		confirmLabel: t('dms_automation.templates.delete'),
	})
	if (!ok) return
	try {
		await $authFetch(`${props.apiUrl}/templates/${s._id}?force=1`, { method: 'DELETE' })
	} catch (e) {
		const kept = errorCode(e) === 'fork-incomplete'
		toast.add({
			title: kept ? t('dms_automation.templates.forkIncomplete') : t('dms_automation.templates.deleteError'),
			description: kept ? t('dms_automation.templates.forkIncompleteHint') : errorMessage(e),
			color: 'error',
			icon: 'i-ph-warning',
		})
		await usagesRead.refresh()
		return
	}
	toast.add({ title: t('dms_automation.templates.deleted', { name: s.name }), color: 'success', icon: 'i-ph-check-circle' })
	// Gone from the list at once (the detail moves to the first template); the
	// page's refresh on the templates topic reads the forked graphs and usage
	// counts again.
	replaceListed((rows) => rows.filter((x) => x._id !== s._id))
}

/** "1 procedure", "2 procedures and 1 template": who places the template. */
function ownersOf(found: TemplateUsages): string {
	const procedureCount = new Set(found.procedures.map((u) => u.procedureId)).size
	const templateCount = new Set(found.templates.map((u) => u.templateId)).size
	const parts = [
		procedureCount ? t('dms_automation.templates.ownerProcedures', { count: procedureCount }, procedureCount) : '',
		templateCount ? t('dms_automation.templates.ownerTemplates', { count: templateCount }, templateCount) : '',
	].filter(Boolean)
	return parts.length === 2 ? t('dms_automation.templates.ownersAnd', { first: parts[0], second: parts[1] }) : parts[0]!
}

function schemaTypeOf(p: TemplatePort): string {
	if (p.kind !== 'data') return '—'
	const type = p.schema?.type
	if (typeof type === 'string') return type
	if (Array.isArray(type)) return type.join(' | ')
	return 'any'
}
</script>

<template>
	<div class="@container">
		<div class="grid grid-cols-1 items-start gap-5 @5xl:grid-cols-[20rem_minmax(0,1fr)]">
			<div ref="list" class="dms-card flex flex-col gap-2 p-2">
				<DmsSearchInput v-model="search" size="sm" :placeholder="$t('dms_automation.templates.search')" class="w-full" />
				<div v-if="loading && items.length === 0" class="flex flex-col gap-2 p-1">
					<USkeleton v-for="i in 3" :key="i" class="h-12 w-full" />
				</div>
				<DmsEmptyState
					v-else-if="loadError"
					size="sm"
					variant="error"
					:title="$t('dms_automation.templates.loadError')"
					:description="loadError"
					:actions="[{ label: $t('dms_automation.common.retry'), onClick: loadList }]"
				/>
				<DmsEmptyState
					v-else-if="items.length === 0"
					size="sm"
					icon="i-ph-stack"
					:title="$t('dms_automation.templates.empty')"
					:description="$t('dms_automation.templates.emptyHint')"
				/>
				<template v-else>
					<button
						v-for="row in filteredItems"
						:key="row._id"
						type="button"
						class="flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors"
						:class="row._id === selectedId ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-elevated'"
						:aria-current="row._id === selectedId ? 'true' : undefined"
						@click="select(row._id)"
					>
						<UIcon :name="row.icon || DEFAULT_ICON" class="mt-0.5 size-4 shrink-0 text-muted" />
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-medium text-highlighted">{{ row.name }}</span>
							<span v-if="row.description" class="truncate text-xs text-muted">{{ row.description }}</span>
						</span>
						<span class="shrink-0 font-mono text-[11px] text-dimmed">{{ $t('dms_automation.library.uses', { count: row.usageCount ?? 0 }) }}</span>
					</button>
					<p v-if="filteredItems.length === 0" class="p-3 text-center text-xs text-dimmed">{{ $t('dms_automation.library.noMatch') }}</p>
					<p v-if="total > items.length" class="p-3 text-center text-xs text-warning">
						{{ $t('dms_automation.templates.truncated', { shown: items.length, total }) }}
					</p>
				</template>
			</div>

			<div v-if="selected" ref="detail" class="flex scroll-mt-4 flex-col gap-4">
				<UButton class="self-start @5xl:hidden" size="sm" variant="ghost" color="neutral" icon="i-ph-arrow-up" @click="backToList">
					{{ $t('dms_automation.library.backToList') }}
				</UButton>
				<DmsCard>
					<div class="flex flex-wrap items-start gap-4">
						<DmsIconWell :icon="formIcon || DEFAULT_ICON" tone="primary" size="xl" />
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<h2 class="text-lg font-semibold break-words text-highlighted">{{ selected.name }}</h2>
							<p class="font-mono text-xs break-all text-dimmed">{{ selected._id }}</p>
						</div>
						<UButton color="neutral" variant="outline" icon="i-ph-tree-structure" @click="editGraph(selected._id)">
							{{ $t('dms_automation.templates.editGraph') }}
						</UButton>
					</div>
				</DmsCard>

				<div ref="form">
					<DmsCard :title="$t('dms_automation.templates.details')">
						<div>
							<DmsFieldRow layout="form" :label="$t('dms_automation.templates.form.name')" :label-for="NAME_ID" required>
								<div class="grid gap-1.5">
									<DmsInputText :id="NAME_ID" v-model="formName" class="w-full" :maxlength="NAME_MAX" v-bind="fieldErrors.aria('name')" />
									<DmsFieldError :id="fieldErrors.errorId('name')" :message="fieldErrors.errors.name" />
								</div>
							</DmsFieldRow>
							<DmsFieldRow layout="form" :label="$t('dms_automation.templates.form.description')" label-for="template-description">
								<DmsTextarea id="template-description" v-model="formDescription" class="w-full" :rows="2" :maxlength="DESCRIPTION_MAX" />
							</DmsFieldRow>
							<DmsFieldRow layout="form" :label="$t('dms_automation.templates.form.icon')">
								<DmsAutomationIconPicker v-model="formIcon" />
							</DmsFieldRow>
							<DmsFormRequiredLegend class="px-[18px] pt-3" />
						</div>
						<template #footer>
							<div class="flex w-full justify-end">
								<UButton color="primary" icon="i-ph-floppy-disk" :disabled="!dirty || !iconValid" :loading="saving" @click="onSave">
									{{ $t('dms_automation.common.save') }}
								</UButton>
							</div>
						</template>
					</DmsCard>
				</div>

				<DmsCard :title="$t('dms_automation.templates.ports.title')" :count="selected.ports?.length ?? 0">
					<p class="mb-3 text-xs text-muted">{{ $t('dms_automation.templates.ports.editHint') }}</p>
					<p v-if="(selected.ports ?? []).length === 0" class="text-xs text-dimmed">{{ $t('dms_automation.templates.ports.empty') }}</p>
					<div v-else class="overflow-hidden rounded-md border border-default">
						<table class="w-full text-left text-xs">
							<thead class="bg-elevated/60 font-mono text-[10.5px] text-dimmed uppercase">
								<tr>
									<th class="px-3 py-1.5 font-normal">{{ $t('dms_automation.templates.ports.col.kind') }}</th>
									<th class="px-3 py-1.5 font-normal">{{ $t('dms_automation.templates.ports.col.direction') }}</th>
									<th class="px-3 py-1.5 font-normal">{{ $t('dms_automation.templates.ports.col.name') }}</th>
									<th class="px-3 py-1.5 font-normal">{{ $t('dms_automation.templates.ports.col.type') }}</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-default">
								<tr v-for="(port, index) in selected.ports" :key="`${port.direction}-${port.kind}-${port.name}-${index}`">
									<td class="px-3 py-1.5">
										<UBadge :color="port.kind === 'trigger' ? 'info' : 'success'" variant="subtle" size="sm">
											{{ $t(`dms_automation.templates.ports.kind.${port.kind}`) }}
										</UBadge>
									</td>
									<td class="px-3 py-1.5 text-muted">{{ $t(`dms_automation.templates.ports.direction.${port.direction}`) }}</td>
									<td class="px-3 py-1.5 font-mono text-highlighted">{{ port.name }}</td>
									<td class="px-3 py-1.5 font-mono text-muted">{{ schemaTypeOf(port) }}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</DmsCard>

				<DmsCard :title="$t('dms_automation.templates.usedIn')" :count="usageRows.length">
					<p v-if="usageRows.length" class="mb-3 text-xs text-muted">{{ $t('dms_automation.templates.usedInHint') }}</p>
					<div v-if="usagesLoading" class="flex flex-col gap-2">
						<USkeleton v-for="i in 2" :key="i" class="h-8 w-full" />
					</div>
					<p v-else-if="usageRows.length === 0" class="text-xs text-dimmed">{{ $t('dms_automation.templates.unused') }}</p>
					<ul v-else class="divide-y divide-default">
						<li v-for="row in usageRows" :key="`${row.kind}-${row.id}`" class="flex items-center gap-3 py-2">
							<template v-if="row.kind === 'procedure'">
								<DmsStatusPill
									v-if="procedures.get(row.id)"
									:tone="STATE_TONES[procedures.get(row.id)!.status]"
									:label="$t(`dms_automation.procedures.status.${procedures.get(row.id)!.status}`)"
									size="sm"
								/>
								<span class="min-w-0 flex-1 truncate text-sm text-highlighted">
									{{ procedures.get(row.id)?.name ?? row.id }}
								</span>
							</template>
							<template v-else>
								<UBadge size="sm" color="neutral" variant="subtle" icon="i-ph-stack">{{ $t('dms_automation.templates.templateBadge') }}</UBadge>
								<span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ templateNames.get(row.id) ?? row.id }}</span>
							</template>
							<span v-if="row.count > 1" class="shrink-0 font-mono text-[11px] text-dimmed">
								{{ $t('dms_automation.templates.placements', { count: row.count }) }}
							</span>
							<UButton
								v-if="row.kind === 'procedure'"
								size="xs"
								variant="ghost"
								color="neutral"
								trailing-icon="i-ph-arrow-up-right"
								@click="openUsage(row.first as TemplateUsage)"
							>
								{{ $t('dms_automation.library.open') }}
							</UButton>
							<UButton v-else size="xs" variant="ghost" color="neutral" trailing-icon="i-ph-arrow-up-right" @click="editGraph(row.id)">
								{{ $t('dms_automation.templates.editGraph') }}
							</UButton>
						</li>
					</ul>
				</DmsCard>

				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-xs text-muted">{{ $t('dms_automation.templates.deleteHint') }}</p>
					<UButton color="error" variant="soft" icon="i-ph-trash" @click="onDelete">
						{{ $t('dms_automation.templates.delete') }}
					</UButton>
				</div>
			</div>
		</div>
	</div>
</template>
