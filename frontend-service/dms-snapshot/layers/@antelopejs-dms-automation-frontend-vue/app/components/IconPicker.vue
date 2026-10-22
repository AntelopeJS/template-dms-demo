<script lang="ts">
/** An Iconify name, `i-<set>-<icon>`, as the server accepts it. */
const ICON_PATTERN = /^i-[a-z0-9]+-[a-z0-9-]+$/

export function isIconName(name: string): boolean {
	return ICON_PATTERN.test(name)
}

// Where the DMS frontend answers Iconify queries, `not_found` listing the
// names a collection lacks.
const ICON_API_PATH = '/api/_dms/icons/'
</script>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

// A grid of icons to pick from, with a search, in place of typing an Iconify
// name. "More…" keeps the free text for an icon outside the grid, with a
// preview; it is open from the start when the current icon is not in the grid.

const ICONS = [
	'i-ph-package', 'i-ph-stack', 'i-ph-flow-arrow', 'i-ph-lightning', 'i-ph-webhooks-logo',
	'i-ph-clock', 'i-ph-calendar', 'i-ph-envelope', 'i-ph-paper-plane-tilt', 'i-ph-bell',
	'i-ph-chat-circle', 'i-ph-database', 'i-ph-cloud-arrow-up', 'i-ph-globe', 'i-ph-plugs',
	'i-ph-arrows-clockwise', 'i-ph-shield-check', 'i-ph-warning', 'i-ph-bug', 'i-ph-receipt',
	'i-ph-invoice', 'i-ph-credit-card', 'i-ph-shopping-cart', 'i-ph-user', 'i-ph-users',
	'i-ph-file-text', 'i-ph-table', 'i-ph-chart-bar', 'i-ph-funnel', 'i-ph-magic-wand',
	'i-ph-robot', 'i-ph-gear', 'i-ph-key', 'i-ph-lock', 'i-ph-map-pin', 'i-ph-truck',
]

const model = defineModel<string>({ default: 'i-ph-package' })

const query = ref('')
const custom = ref(!ICONS.includes(model.value))
const customId = useId()
const unknown = ref(false)

// Another template picked in the same form: show its icon if the grid lacks
// it, and say so when no icon has that name (it would show empty).
let check: ReturnType<typeof setTimeout> | undefined
watch(
	model,
	(icon) => {
		unknown.value = false
		clearTimeout(check)
		if (!icon || ICONS.includes(icon)) return
		custom.value = true
		if (!isIconName(icon) || import.meta.env.SSR) return
		check = setTimeout(() => void lookUp(icon), 300)
	},
	{ immediate: true },
)

async function lookUp(icon: string) {
	// `i-ph-heart-beat`: collection `ph`, icon `heart-beat`. A collection with a
	// dash in its name is not found this way, and is then not flagged.
	const [, prefix, name] = icon.match(/^i-([a-z0-9]+)-(.+)$/) ?? []
	try {
		const response = await fetch(`${ICON_API_PATH}${prefix}.json?icons=${name}`)
		if (!response.ok) return
		const data = (await response.json()) as { not_found?: string[] }
		if (model.value === icon) unknown.value = !!data.not_found?.includes(name!)
	} catch {
		// Unknown stays false: a lookup that failed says nothing of the icon.
	}
}

const visible = computed(() => {
	const q = query.value.trim().toLowerCase()
	return q ? ICONS.filter((icon) => icon.includes(q)) : ICONS
})
const invalid = computed(() => !!model.value && !isIconName(model.value))

function label(icon: string): string {
	return icon.replace(/^i-ph-/, '').replace(/-/g, ' ')
}
</script>

<template>
	<div class="flex max-w-md flex-col gap-2">
		<div class="flex items-center gap-2">
			<UInput v-model="query" size="sm" icon="i-ph-magnifying-glass" :placeholder="$t('dms_automation.iconPicker.search')" class="flex-1" />
			<UButton size="sm" variant="ghost" color="neutral" :aria-expanded="custom" @click="custom = !custom">
				{{ $t('dms_automation.iconPicker.more') }}
			</UButton>
		</div>
		<div class="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(2rem,1fr))]" role="listbox" :aria-label="$t('dms_automation.iconPicker.label')">
			<UTooltip v-for="icon in visible" :key="icon" :text="label(icon)">
				<button
					type="button"
					role="option"
					:aria-selected="model === icon"
					:aria-label="label(icon)"
					class="grid size-10 place-items-center rounded-md border transition-colors sm:size-8"
					:class="model === icon ? 'border-primary bg-primary/10 text-primary' : 'border-default text-muted hover:bg-elevated'"
					@click="model = icon"
				>
					<UIcon :name="icon" class="size-4" />
				</button>
			</UTooltip>
		</div>
		<div v-if="custom" class="flex flex-col gap-1">
			<div class="flex items-center gap-2">
				<span class="grid size-8 shrink-0 place-items-center rounded-md border border-default text-muted" aria-hidden="true">
					<UIcon v-if="model && !invalid" :name="model" class="size-4" />
				</span>
				<UInput
					:id="customId"
					v-model="model"
					size="sm"
					placeholder="i-ph-package"
					class="flex-1 font-mono"
					:aria-label="$t('dms_automation.iconPicker.custom')"
					:aria-invalid="invalid || undefined"
					:aria-describedby="invalid ? `${customId}-error` : unknown ? `${customId}-unknown` : undefined"
				/>
			</div>
			<DmsFieldError :id="`${customId}-error`" :message="invalid ? $t('dms_automation.iconPicker.invalid') : null" />
			<p v-if="unknown" :id="`${customId}-unknown`" class="text-xs text-warning">{{ $t('dms_automation.iconPicker.unknown') }}</p>
		</div>
	</div>
</template>
