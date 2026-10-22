<script setup lang="ts">
import { computed } from 'vue'

// The full URL a webhook trigger is called on — the API server's public
// origin and the trigger's path — with a copy button, and a curl example.
// `compact` keeps the URL and its copy button only, for a line in a list.
// Until the origin is known, or if it can't be, no URL is offered to copy:
// the path alone would be a wrong address to hand to another service.

interface WebhookBase {
	url: string
	configured: boolean
}

const props = withDefaults(
	defineProps<{
		path: string
		method?: string
		apiUrl?: string
		compact?: boolean
	}>(),
	{ method: 'POST', apiUrl: '/api/automation', compact: false },
)

// Every endpoint shown is on the same origin: the endpoints of a page share
// one read, made with the page.
const baseRead = useApiData<WebhookBase>(`${props.apiUrl}/library/webhook-base`)
const base = computed(() => baseRead.data.value)
// A failure kept while it is tried again still shows the skeleton.
const status = computed<'loading' | 'ready' | 'error'>(() =>
	base.value ? 'ready' : baseRead.error.value && baseRead.status.value !== 'pending' ? 'error' : 'loading',
)

const url = computed(() => `${base.value?.url ?? ''}${props.path}`)
const method = computed(() => (props.method || 'POST').toUpperCase())

const curl = computed(() => {
	if (method.value === 'GET') return `curl '${url.value}'`
	if (method.value === 'DELETE') return `curl -X DELETE '${url.value}'`
	return [`curl -X ${method.value} '${url.value}'`, `  -H 'content-type: application/json'`, `  -d '{}'`].join(' \\\n')
})
</script>

<template>
	<span v-if="compact" class="flex min-w-0 items-center gap-1">
		<span class="min-w-0 truncate font-mono text-xs text-muted" :title="status === 'ready' ? url : undefined">
			{{ method }} {{ status === 'ready' ? url : path }}
		</span>
		<DmsCopyButton v-if="status === 'ready'" :value="url" />
		<UIcon v-else-if="status === 'loading'" name="i-ph-circle-notch" class="size-3.5 shrink-0 animate-spin text-dimmed" :aria-label="$t('dms_automation.library.webhookLoading')" />
		<UTooltip v-else :text="$t('dms_automation.library.webhookBaseError')">
			<UIcon name="i-ph-warning" class="size-3.5 shrink-0 text-warning" :aria-label="$t('dms_automation.library.webhookBaseError')" />
		</UTooltip>
	</span>
	<div v-else class="flex flex-col gap-2">
		<p class="text-xs text-muted">{{ $t('dms_automation.library.webhook.hint') }}</p>
		<template v-if="status === 'ready'">
			<div class="flex min-w-0 items-center gap-2 rounded-md border border-default bg-elevated/40 py-1 ps-2.5 pe-1">
				<UBadge size="sm" color="neutral" variant="subtle" class="font-mono">{{ method }}</UBadge>
				<span class="min-w-0 flex-1 truncate font-mono text-xs text-highlighted" :title="url">{{ url }}</span>
				<DmsCopyButton :value="url" />
			</div>
			<DmsCodeSnippet :code="curl" language="shell" :title="$t('dms_automation.library.webhook.example')" wrap />
			<p v-if="!base?.configured" class="text-[11px] text-dimmed">
				{{ $t('dms_automation.library.webhook.unconfigured') }}
			</p>
		</template>
		<USkeleton v-else-if="status === 'loading'" class="h-9 w-full" :aria-label="$t('dms_automation.library.webhookLoading')" />
		<p v-else class="text-xs text-warning">{{ $t('dms_automation.library.webhookBaseError') }}</p>
	</div>
</template>
