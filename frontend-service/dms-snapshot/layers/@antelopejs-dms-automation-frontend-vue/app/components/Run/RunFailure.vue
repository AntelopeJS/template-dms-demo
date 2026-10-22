<script setup lang="ts">
import { computed } from 'vue'
import type { RunDetail } from '../../composables/useAutomationRuns'
import { describeDuration, describeTime, stepTitle } from '../../utils/describe'

// Where and why a failed run stopped: the step by name, the error, how many
// runs in a row failed the same way, and a link to when it last worked.

const props = defineProps<{ run: RunDetail; traceUrl: string }>()

const { processI18n } = useTranslation()
const { dateTimeFormat } = useRegionalFormat()

const step = computed(() => stepTitle(props.run.failedStep, processI18n))

const lastSuccess = computed(() => {
	const last = props.run.lastSuccess
	return last
		? {
				to: `${props.traceUrl}?run=${encodeURIComponent(last.runId)}`,
				label: processI18n('$dms_automation.trace.lastSuccessAt', { time: describeTime(last.startedAt, dateTimeFormat) }),
				id: last.runId.slice(0, 8),
			}
		: null
})
</script>

<template>
	<div class="flex flex-col gap-3 rounded-lg border border-error/40 bg-error/5 p-4">
		<div class="flex items-start gap-3">
			<DmsIconWell icon="i-ph-x-circle" tone="error" size="sm" />
			<div class="flex min-w-0 flex-col gap-1">
				<p class="text-sm font-semibold text-highlighted">
					{{ step ? $t('dms_automation.trace.failedAt', { step }) : $t('dms_automation.trace.failed') }}
				</p>
				<p class="text-xs text-muted">
					{{ $t('dms_automation.trace.failedAfter', { duration: describeDuration(run.durationMs) }) }}
					<template v-if="run.failuresInRow > 1">
						{{ processI18n('$dms_automation.trace.failuresInRow', { count: run.failuresInRow }) }}
					</template>
				</p>
				<DmsLink v-if="lastSuccess" :to="lastSuccess.to" class="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-highlighted">
					<UIcon name="i-ph-check-circle" class="size-3.5 text-success" />
					{{ lastSuccess.label }}
					<span class="font-mono">{{ lastSuccess.id }}</span>
				</DmsLink>
			</div>
		</div>
		<pre class="max-h-48 overflow-auto rounded-md bg-default p-2 font-mono text-xs whitespace-pre-wrap text-error">{{ run.errorMessage }}</pre>
		<div v-if="$slots.default" class="flex flex-wrap gap-2">
			<slot />
		</div>
	</div>
</template>
