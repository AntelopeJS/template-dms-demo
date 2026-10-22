<script setup lang="ts">
import { computed } from 'vue'

// The properties of a JSON schema as a typed table: name, type (with its enum
// values or default), description. Used for a type's settings, inputs and
// outputs in the library. Nested object properties read `parent.child`, an
// array its item type (`string[]`), and fields of which one is required are
// named under the table.

interface JsonSchemaProperty {
	type?: string | string[]
	title?: string
	description?: string
	enum?: unknown[]
	default?: unknown
	format?: string
	items?: JsonSchemaProperty
	properties?: Record<string, JsonSchemaProperty>
	required?: string[]
	anyOf?: JsonSchemaProperty[]
	oneOf?: JsonSchemaProperty[]
}

const props = defineProps<{
	schema?: JsonSchemaProperty | null
}>()

const { processI18n } = useTranslation()

// Deep enough for any real settings form; stops a self-similar schema.
const MAX_DEPTH = 3

function typeOf(p: JsonSchemaProperty): string {
	if (Array.isArray(p.type)) return p.type.join(' | ')
	if (p.type === 'array') return p.items ? `${typeOf(p.items)}[]` : 'array'
	if (p.type) return p.type
	const alternatives = p.anyOf ?? p.oneOf
	if (alternatives?.some((a) => a.type)) return alternatives.map(typeOf).join(' | ')
	return p.enum ? 'enum' : 'any'
}

interface Row {
	name: string
	depth: number
	type: string
	required: boolean
	description: string
	details: string
}

function rowsOf(schema: JsonSchemaProperty | null | undefined, prefix: string, depth: number): Row[] {
	const required = new Set(schema?.required ?? [])
	return Object.entries(schema?.properties ?? {}).flatMap(([key, p]) => {
		const details: string[] = []
		if (p.enum) details.push(p.enum.map(String).join(' · '))
		if (p.default !== undefined && p.default !== '') details.push(`default ${JSON.stringify(p.default)}`)
		const type = typeOf(p)
		const row: Row = {
			name: `${prefix}${key}`,
			depth,
			type: p.format ? `${type} (${p.format})` : type,
			required: required.has(key),
			description: [p.title, p.description].filter(Boolean).map((t) => processI18n(String(t))).join(' — '),
			details: details.join(', '),
		}
		const nested = p.type === 'array' ? p.items : p
		const children = depth < MAX_DEPTH ? rowsOf(nested, `${row.name}${p.type === 'array' ? '[].' : '.'}`, depth + 1) : []
		return [row, ...children]
	})
}

const rows = computed(() => rowsOf(props.schema, '', 0))
const hasDescriptions = computed(() => rows.value.some((r) => r.description || r.details))

// "userIds or roleIds": the alternatives of the schema that each require
// fields, as `anyOf: [{ required: ['userIds'] }, { required: ['roleIds'] }]`.
const oneOf = computed(() =>
	(props.schema?.anyOf ?? props.schema?.oneOf ?? [])
		.map((a) => (a.required ?? []).join(' + '))
		.filter(Boolean)
		.join(', '),
)

/** Text with its `inline code` spans apart, to render them as code. */
function segments(text: string): { code: boolean; text: string }[] {
	return text
		.split(/`([^`]+)`/)
		.map((part, index) => ({ code: index % 2 === 1, text: part }))
		.filter((s) => s.text)
}
</script>

<template>
	<div v-if="rows.length" class="flex flex-col gap-2">
		<div class="overflow-hidden rounded-md border border-default">
			<table class="w-full text-left text-xs">
				<thead class="bg-elevated/60 font-mono text-[10.5px] text-dimmed uppercase">
					<tr>
						<th class="px-3 py-1.5 font-normal">{{ $t('dms_automation.library.schema.name') }}</th>
						<th class="px-3 py-1.5 font-normal">{{ $t('dms_automation.library.schema.type') }}</th>
						<th v-if="hasDescriptions" class="px-3 py-1.5 font-normal">{{ $t('dms_automation.library.schema.description') }}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-default">
					<tr v-for="row in rows" :key="row.name">
						<td class="px-3 py-1.5 font-mono text-highlighted" :style="row.depth ? { paddingInlineStart: `${0.75 + row.depth}rem` } : undefined">
							{{ row.name }}
						</td>
						<td class="px-3 py-1.5 font-mono text-muted">
							{{ row.type }}
							<span v-if="row.required" class="text-warning">· {{ $t('dms_automation.library.schema.required') }}</span>
						</td>
						<td v-if="hasDescriptions" class="px-3 py-1.5 text-toned">
							<template v-for="(segment, index) in segments(row.description)" :key="index">
								<code v-if="segment.code" class="rounded bg-elevated px-1 font-mono text-[11px]">{{ segment.text }}</code>
								<template v-else>{{ segment.text }}</template>
							</template>
							<span v-if="row.details" class="block font-mono text-[11px] text-dimmed">{{ row.details }}</span>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p v-if="oneOf" class="text-xs text-muted">{{ $t('dms_automation.library.schemaOneOf', { fields: oneOf }) }}</p>
	</div>
	<p v-else class="text-xs text-dimmed">{{ $t('dms_automation.library.schema.none') }}</p>
</template>
