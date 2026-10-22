<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
	NodeKind,
	TriggerType,
	ActionType,
	DataNodeType,
	GroupPort,
} from '../../composables/useGraphConnect'
import { PALETTE_DRAG_TYPE, type NodeKindEntry, type PaletteBlock, type TemplateSummary } from '../../composables/useAutomationNodeKinds'

const props = defineProps<{
	nodeKinds: NodeKindEntry[]
	triggerTypes: TriggerType[]
	actionTypes: ActionType[]
	dataNodeTypes: DataNodeType[]
	templates?: TemplateSummary[]
}>()

const emit = defineEmits<{
	(e: 'add-node', payload: { kind: NodeKind; typeId?: string }): void
	(e: 'add-template', template: TemplateSummary): void
}>()

const search = ref('')

// Registered type names may be `$`-prefixed DMS i18n keys shipped in the
// declaring module's locales; plain text is shown as written. Search matches
// the translated label, the type id, its data category and its description.
const { processI18n } = useTranslation()
const { t, te } = useI18n()

interface PaletteItem {
	key: string
	label: string
	icon: string
	kind?: NodeKind
	typeId?: string
	template?: TemplateSummary
	/** Data category of a data node. */
	category?: string
	/** Switched off in the Library: its steps fail when they run. */
	off?: boolean
	/** Lower-cased text the search looks in. */
	keywords: string
}
// Items inside a category are bucketed by the module that registered them:
// one unlabeled leading section for our own built-ins (types the backend left
// unattributed, plus plain node kinds), then one labeled section per external
// module. Built-in data nodes are split further by their data category.
interface PaletteSection {
	/** Sub-header: a data category, or the id of the module that registered the types. */
	label?: string
	module?: boolean
	items: PaletteItem[]
}
interface PaletteGroup {
	key: string
	label: string
	icon: string
	sections: PaletteSection[]
}

// Same category ordering / labels / icons the old "Add node" dropdown used —
// reproduced here as a grouped, searchable left sidebar per autov2-builder.
const CATEGORY_ORDER = ['trigger', 'action', 'flow', 'helper', 'data'] as const
const CATEGORY_LABEL: Record<string, string> = {
	trigger: '$dms_automation.builder.palette.groups.trigger',
	action: '$dms_automation.builder.palette.groups.action',
	flow: '$dms_automation.builder.palette.groups.flow',
	helper: '$dms_automation.builder.palette.groups.helper',
	data: '$dms_automation.builder.palette.groups.data',
}
const CATEGORY_ICON: Record<string, string> = {
	trigger: 'i-ph-lightning',
	action: 'i-ph-gear',
	flow: 'i-ph-git-fork',
	helper: 'i-ph-toolbox',
	data: 'i-ph-function',
}

// Bucket key for the unlabeled built-in section. The backend omits `module`
// for our own types and for any it couldn't attribute, so both land here
// rather than under an invented "unknown" sub-header.
const BUILTIN_BUCKET = ''

// Order of the built-in data categories; any other one follows, A to Z.
const DATA_CATEGORY_ORDER = ['constant', 'math', 'compare', 'boolean', 'string', 'object', 'json']

function dataCategoryLabel(category: string): string {
	const key = `dms_automation.types.dataCategories.${category}`
	return te(key) ? t(key) : category
}

function keywordsOf(...parts: Array<string | undefined>): string {
	return parts.filter(Boolean).join(' ').toLowerCase()
}

// Built-in data nodes, one section per data category.
function dataSections(items: PaletteItem[]): PaletteSection[] {
	const rank = (c: string) => {
		const i = DATA_CATEGORY_ORDER.indexOf(c)
		return i === -1 ? DATA_CATEGORY_ORDER.length : i
	}
	const categories = [...new Set(items.map((it) => it.category ?? ''))].sort(
		(a, b) => rank(a) - rank(b) || a.localeCompare(b),
	)
	return categories.map((category) => ({
		label: dataCategoryLabel(category),
		items: items.filter((it) => (it.category ?? '') === category),
	}))
}

const groups = computed<PaletteGroup[]>(() => {
	const out: PaletteGroup[] = []

	const kindsByCategory = new Map<string, NodeKindEntry[]>()
	for (const k of props.nodeKinds ?? []) {
		const cat = k.meta.ui?.category
		if (!cat) continue
		const arr = kindsByCategory.get(cat) ?? []
		arr.push(k)
		kindsByCategory.set(cat, arr)
	}

	for (const cat of CATEGORY_ORDER) {
		const kinds = kindsByCategory.get(cat)
		if (!kinds || kinds.length === 0) continue
		const groupIcon = CATEGORY_ICON[cat] ?? 'i-ph-circle'
		const byModule = new Map<string, PaletteItem[]>()
		const push = (bucket: string, item: PaletteItem) => {
			const arr = byModule.get(bucket) ?? []
			arr.push(item)
			byModule.set(bucket, arr)
		}

		for (const k of kinds) {
			const ui = k.meta.ui!
			const reg = ui.typeRegistry
			if (reg === 'triggers' || reg === 'actions') {
				for (const type of (reg === 'triggers' ? props.triggerTypes : props.actionTypes) ?? []) {
					const label = processI18n(type.name)
					push(type.module ?? BUILTIN_BUCKET, {
						key: `${k.kind}:${type.id}`,
						label,
						icon: type.icon ?? groupIcon,
						kind: k.kind,
						typeId: type.id,
						off: type.enabled === false,
						keywords: keywordsOf(label, type.id, type.description && processI18n(type.description), type.module),
					})
				}
			} else if (reg === 'dataNodes') {
				for (const d of props.dataNodeTypes ?? []) {
					const label = processI18n(d.name)
					push(d.module ?? BUILTIN_BUCKET, {
						key: `${k.kind}:${d.id}`,
						label,
						icon: d.icon ?? groupIcon,
						kind: k.kind,
						typeId: d.id,
						category: d.category,
						keywords: keywordsOf(label, d.id, d.category, dataCategoryLabel(d.category), processI18n(d.description), d.module),
					})
				}
			} else {
				// Plain node kinds (flow / helpers) are built into this module.
				push(BUILTIN_BUCKET, { key: k.kind, label: ui.label, icon: ui.icon ?? groupIcon, kind: k.kind, keywords: keywordsOf(ui.label, k.kind) })
			}
		}

		// Built-ins first (they're the defaults shipped with the module), then
		// one labeled section per external module, alphabetically.
		const sections: PaletteSection[] = []
		const builtins = byModule.get(BUILTIN_BUCKET)
		if (builtins && builtins.length > 0) {
			if (cat === 'data') sections.push(...dataSections(builtins))
			else sections.push({ items: builtins })
		}
		const externalModules = [...byModule.keys()]
			.filter((m) => m !== BUILTIN_BUCKET)
			.sort()
		for (const mod of externalModules) {
			sections.push({ label: mod, module: true, items: byModule.get(mod)! })
		}

		if (sections.length > 0) out.push({ key: cat, label: processI18n(CATEGORY_LABEL[cat] ?? cat), icon: groupIcon, sections })
	}

	if (props.templates && props.templates.length > 0) {
		out.push({
			key: 'templates',
			label: processI18n('$dms_automation.builder.palette.groups.templates'),
			icon: 'i-ph-package',
			sections: [
				{
					items: props.templates.map((tpl) => {
						const label = tpl.name.trim() || t('dms_automation.builder.palette.untitledTemplate')
						return { key: `tpl:${tpl._id}`, label, icon: tpl.icon ?? 'i-ph-package', template: tpl, keywords: keywordsOf(label) }
					}),
				},
			],
		})
	}

	return out
})

const filteredGroups = computed<PaletteGroup[]>(() => {
	const q = search.value.trim().toLowerCase()
	if (!q) return groups.value
	return groups.value
		.map((g) => ({
			...g,
			sections: g.sections
				.map((s) => ({ ...s, items: s.items.filter((it) => it.keywords.includes(q)) }))
				.filter((s) => s.items.length > 0),
		}))
		.filter((g) => g.sections.length > 0)
})

function onItem(item: PaletteItem) {
	if (item.template) emit('add-template', item.template)
	else if (item.kind) emit('add-node', { kind: item.kind, typeId: item.typeId })
}

// The canvas reads the block back on drop and places it there.
function onDragStart(event: DragEvent, item: PaletteItem) {
	if (!event.dataTransfer) return
	const block: PaletteBlock = item.template ? { template: item.template } : { kind: item.kind, typeId: item.typeId }
	event.dataTransfer.setData(PALETTE_DRAG_TYPE, JSON.stringify(block))
	event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
	<div
		class="flex h-full flex-col overflow-hidden bg-elevated/40"
	>
		<div class="border-b border-default p-2.5">
			<DmsSearchInput
				v-model="search"
				size="sm"
				:placeholder="$t('dms_automation.builder.palette.search')"
				class="w-full"
			/>
		</div>
		<div class="flex-1 overflow-y-auto p-2">
			<div v-for="group in filteredGroups" :key="group.key" class="mb-2 last:mb-0">
				<div
					class="px-2 pb-1 pt-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-dimmed"
				>
					{{ group.label }}
					<span class="ml-1 text-dimmed/70">{{ group.sections.reduce((n, s) => n + s.items.length, 0) }}</span>
				</div>
				<template v-for="section in group.sections" :key="section.label ?? ''">
					<div
						v-if="section.label"
						class="flex items-center gap-1.5 px-2 pb-0.5 pt-1.5 text-[10px] font-medium text-dimmed"
					>
						<UIcon v-if="section.module" name="i-ph-puzzle-piece" class="size-3 shrink-0" />
						<span class="truncate">{{ section.label }}</span>
					</div>
					<button
						v-for="item in section.items"
						:key="item.key"
						type="button"
						draggable="true"
						:title="item.off ? $t('dms_automation.builder.palette.offHint') : undefined"
						class="group flex w-full cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-sm text-toned transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-highlighted"
						@click="onItem(item)"
						@dragstart="onDragStart($event, item)"
					>
						<UIcon :name="item.icon" class="size-4 shrink-0" :class="item.off ? 'text-dimmed' : 'text-primary'" />
						<span class="min-w-0 flex-1 truncate" :class="{ 'text-dimmed': item.off }">{{ item.label }}</span>
						<UBadge v-if="item.off" size="sm" color="neutral" variant="subtle">{{ $t('dms_automation.builder.palette.off') }}</UBadge>
						<UIcon
							name="i-ph-plus"
							class="size-3.5 shrink-0 text-dimmed opacity-0 transition-opacity group-hover:opacity-100"
						/>
					</button>
				</template>
			</div>
			<div
				v-if="filteredGroups.length === 0"
				class="px-2 py-6 text-center text-xs text-dimmed"
			>
				{{ $t('dms_automation.builder.palette.empty') }}
			</div>
		</div>
		<p class="border-t border-default px-3 py-2 text-[11px] text-dimmed">
			{{ $t('dms_automation.builder.palette.hintDrag') }}
		</p>
	</div>
</template>
