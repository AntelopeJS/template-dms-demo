<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GroupPort } from '../../composables/useGraphConnect'

type SchemaTypeChoice = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'

const SCHEMA_TYPE_CHOICES: SchemaTypeChoice[] = [
	'string',
	'number',
	'boolean',
	'object',
	'array',
	'any',
]

const props = defineProps<{
	ports: GroupPort[]
	/** Shows the ports without editing them (a template instance's ports). */
	readOnly?: boolean
}>()

const emit = defineEmits<{
	(e: 'ports:update', next: GroupPort[]): void
}>()

const activeTab = ref<'data' | 'trigger'>('data')

const { t } = useI18n()
const tabItems = computed(() => [
	{ label: t('dms_automation.editor.groupPorts.dataTab'), value: 'data', slot: 'data', icon: 'i-ph-plugs' },
	{ label: t('dms_automation.editor.groupPorts.triggerTab'), value: 'trigger', slot: 'trigger', icon: 'i-ph-lightning' },
])

interface Section {
	kind: 'data' | 'trigger'
	direction: 'in' | 'out'
}

function portsFor(section: Section): Array<{ port: GroupPort; index: number }> {
	const out: Array<{ port: GroupPort; index: number }> = []
	props.ports.forEach((p, i) => {
		if (p.kind === section.kind && p.direction === section.direction) {
			out.push({ port: p, index: i })
		}
	})
	return out
}

// Surface a per-section duplicate-name error. Returns the first duplicated
// name found within the (kind, direction) tuple, or `null` if all names are
// unique. Used to both disable the Add button and display an inline alert.
function duplicateNameIn(section: Section): string | null {
	const seen = new Set<string>()
	for (const p of props.ports) {
		if (p.kind !== section.kind || p.direction !== section.direction) continue
		const trimmed = p.name.trim()
		if (trimmed === '') continue
		if (seen.has(trimmed)) return trimmed
		seen.add(trimmed)
	}
	return null
}

function nextDefaultName(section: Section): string {
	const taken = new Set(
		props.ports
			.filter((p) => p.kind === section.kind && p.direction === section.direction)
			.map((p) => p.name.trim()),
	)
	const prefix = section.direction === 'in' ? 'input' : 'output'
	for (let i = 1; i < 999; i++) {
		const candidate = `${prefix}${i}`
		if (!taken.has(candidate)) return candidate
	}
	return `${prefix}_${Date.now()}`
}

function emitPorts(next: GroupPort[]) {
	emit('ports:update', next)
}

function addPort(section: Section) {
	if (duplicateNameIn(section)) return
	const newPort: GroupPort =
		section.kind === 'data'
			? {
					name: nextDefaultName(section),
					kind: 'data',
					direction: section.direction,
					schema: { type: 'any' },
				}
			: {
					name: nextDefaultName(section),
					kind: 'trigger',
					direction: section.direction,
				}
	emitPorts([...props.ports, newPort])
}

function removePort(index: number) {
	const next = props.ports.slice()
	next.splice(index, 1)
	emitPorts(next)
}

function updateName(index: number, name: string) {
	const next = props.ports.map((p, i) => (i === index ? { ...p, name } : p))
	emitPorts(next)
}

function schemaTypeOf(port: GroupPort): SchemaTypeChoice {
	const t = port.schema?.type
	if (typeof t === 'string' && (SCHEMA_TYPE_CHOICES as string[]).includes(t)) {
		return t as SchemaTypeChoice
	}
	return 'any'
}

function updateSchemaType(index: number, type: SchemaTypeChoice) {
	const next = props.ports.map((p, i) => {
		if (i !== index) return p
		if (p.kind !== 'data') return p
		if (type === 'any') {
			// Represent "any" as a schema with no type constraint. Keeping a
			// `schema` object (rather than dropping it) preserves the invariant
			// that data ports always carry a schema, even if it's permissive.
			return { ...p, schema: { type: 'any' } }
		}
		return { ...p, schema: { ...(p.schema ?? {}), type } }
	})
	emitPorts(next)
}

const sections = computed(() => ({
	data: {
		in: { kind: 'data' as const, direction: 'in' as const },
		out: { kind: 'data' as const, direction: 'out' as const },
	},
	trigger: {
		in: { kind: 'trigger' as const, direction: 'in' as const },
		out: { kind: 'trigger' as const, direction: 'out' as const },
	},
}))
</script>

<template>
	<UCard>
		<template #header>
			<div class="flex items-center gap-2">
				<UIcon name="i-ph-plugs-connected" class="size-4 text-primary" />
				<span class="text-sm font-semibold text-highlighted">
					{{ $t('dms_automation.editor.groupPorts.title') }}
				</span>
			</div>
		</template>

		<p v-if="readOnly" class="mb-2 text-xs text-muted">
			{{ $t('dms_automation.editor.groupPorts.fromTemplate') }}
		</p>
		<UTabs v-model="activeTab" :items="tabItems" size="sm" variant="link">
			<template #data>
				<div class="flex flex-col gap-4 pt-2">
					<div
						v-for="section in [sections.data.in, sections.data.out]"
						:key="`${section.kind}-${section.direction}`"
						class="flex flex-col gap-2"
					>
						<div class="text-default text-xs font-medium uppercase tracking-wide">
							{{ $t(section.direction === 'in' ? 'dms_automation.editor.groupPorts.inputs' : 'dms_automation.editor.groupPorts.outputs') }}
						</div>

						<div
							v-for="entry in portsFor(section)"
							:key="entry.index"
							class="flex items-center gap-2"
						>
							<UInput
								class="flex-1"
								:placeholder="$t('dms_automation.editor.groupPorts.portName')"
								:aria-label="$t('dms_automation.editor.groupPorts.portName')"
								:disabled="readOnly"
								:model-value="entry.port.name"
								@update:model-value="(v: string | number) => updateName(entry.index, String(v))"
							/>
							<USelect
								class="w-28"
								:disabled="readOnly"
								:items="[...SCHEMA_TYPE_CHOICES]"
								:model-value="schemaTypeOf(entry.port)"
								@update:model-value="(v: string) => updateSchemaType(entry.index, v as SchemaTypeChoice)"
							/>
							<UButton
								v-if="!readOnly"
								size="xs"
								variant="ghost"
								color="error"
								icon="i-ph-trash"
								:aria-label="$t('dms_automation.editor.groupPorts.remove')"
								@click="removePort(entry.index)"
							/>
						</div>

						<div v-if="portsFor(section).length === 0" class="text-dimmed text-xs">
							{{ $t(section.direction === 'in' ? 'dms_automation.editor.groupPorts.noInputs' : 'dms_automation.editor.groupPorts.noOutputs') }}
						</div>

						<UAlert
							v-if="duplicateNameIn(section)"
							color="error"
							variant="subtle"
							icon="i-ph-warning"
							:title="$t('dms_automation.editor.groupPorts.duplicate', { name: duplicateNameIn(section) })"
							:description="$t('dms_automation.editor.groupPorts.duplicateHelp')"
						/>

						<div v-if="!readOnly">
							<UButton
								size="xs"
								variant="soft"
								color="primary"
								icon="i-ph-plus"
								:disabled="!!duplicateNameIn(section)"
								@click="addPort(section)"
							>
								{{ $t(section.direction === 'in' ? 'dms_automation.editor.groupPorts.addInput' : 'dms_automation.editor.groupPorts.addOutput') }}
							</UButton>
						</div>
					</div>
				</div>
			</template>

			<template #trigger>
				<div class="flex flex-col gap-4 pt-2">
					<div v-if="!readOnly" class="text-dimmed text-xs">
						{{ $t('dms_automation.editor.groupPorts.mainHint') }}
					</div>
					<div
						v-for="section in [sections.trigger.in, sections.trigger.out]"
						:key="`${section.kind}-${section.direction}`"
						class="flex flex-col gap-2"
					>
						<div class="text-default text-xs font-medium uppercase tracking-wide">
							{{ $t(section.direction === 'in' ? 'dms_automation.editor.groupPorts.inputs' : 'dms_automation.editor.groupPorts.outputs') }}
						</div>

						<div
							v-for="entry in portsFor(section)"
							:key="entry.index"
							class="flex items-center gap-2"
						>
							<UInput
								class="flex-1"
								:placeholder="$t('dms_automation.editor.groupPorts.portName')"
								:aria-label="$t('dms_automation.editor.groupPorts.portName')"
								:disabled="readOnly"
								:model-value="entry.port.name"
								@update:model-value="(v: string | number) => updateName(entry.index, String(v))"
							/>
							<UButton
								v-if="!readOnly"
								size="xs"
								variant="ghost"
								color="error"
								icon="i-ph-trash"
								:aria-label="$t('dms_automation.editor.groupPorts.remove')"
								@click="removePort(entry.index)"
							/>
						</div>

						<div v-if="portsFor(section).length === 0" class="text-dimmed text-xs">
							{{ $t(section.direction === 'in' ? 'dms_automation.editor.groupPorts.noInputs' : 'dms_automation.editor.groupPorts.noOutputs') }}
						</div>

						<UAlert
							v-if="duplicateNameIn(section)"
							color="error"
							variant="subtle"
							icon="i-ph-warning"
							:title="$t('dms_automation.editor.groupPorts.duplicate', { name: duplicateNameIn(section) })"
							:description="$t('dms_automation.editor.groupPorts.duplicateHelp')"
						/>

						<div v-if="!readOnly">
							<UButton
								size="xs"
								variant="soft"
								color="primary"
								icon="i-ph-plus"
								:disabled="!!duplicateNameIn(section)"
								@click="addPort(section)"
							>
								{{ $t(section.direction === 'in' ? 'dms_automation.editor.groupPorts.addInput' : 'dms_automation.editor.groupPorts.addOutput') }}
							</UButton>
						</div>
					</div>
				</div>
			</template>
		</UTabs>
	</UCard>
</template>
