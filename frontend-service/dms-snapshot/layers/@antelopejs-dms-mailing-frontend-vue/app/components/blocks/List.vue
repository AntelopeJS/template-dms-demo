<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ListBlock } from '../../types/mailing'
import { readPath } from '../../utils/paths'
import { TOKEN_DATA_KEY } from '../../utils/tokens'

interface Props {
	block: ListBlock
}

interface PreviewRow {
	key: number
	label: string
	value: string
}

const PLACEHOLDER_ROWS = 2
const TOKEN_OPEN = '{{'
const TOKEN_CLOSE = '}}'

const props = defineProps<Props>()
const data = inject(TOKEN_DATA_KEY, null)

const cell = (row: unknown, path: string): string => {
	const value = readPath(row, path)
	return value === undefined || value === null ? '' : String(value)
}

const dataRows = computed<PreviewRow[] | null>(() => {
	if (!data?.value) return null
	const source = readPath(data.value, props.block.source)
	if (!Array.isArray(source)) return []
	return source.map((row, key) => ({
		key,
		label: cell(row, props.block.labelPath),
		value: cell(row, props.block.valuePath),
	}))
})

const token = (path: string): string => `${TOKEN_OPEN}${path}${TOKEN_CLOSE}`
</script>

<template>
	<div class="mb-4">
		<table class="w-full border-collapse text-sm">
			<tbody v-if="dataRows">
				<tr
					v-for="row in dataRows"
					:key="row.key"
					class="border-b border-gray-100 last:border-0"
				>
					<td class="py-2 text-gray-600">{{ row.label }}</td>
					<td class="py-2 text-right font-medium text-gray-900">
						{{ row.value }}
					</td>
				</tr>
			</tbody>
			<tbody v-else>
				<tr
					v-for="row in PLACEHOLDER_ROWS"
					:key="row"
					class="border-b border-gray-100 last:border-0"
				>
					<td class="py-2 text-gray-600">
						<MailingTokenText :text="token(block.labelPath)" />
					</td>
					<td class="py-2 text-right font-medium text-gray-900">
						<MailingTokenText :text="token(block.valuePath)" />
					</td>
				</tr>
			</tbody>
		</table>
		<p class="mt-1 font-mono text-[10px] text-gray-600">
			#each {{ block.source }}
		</p>
	</div>
</template>
