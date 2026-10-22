<script setup lang="ts">
import { useSetupFacts } from '../composables/useMailingReads'
import {
	isSetupComplete,
	needsSetup,
	setupSteps,
	type SetupStep,
	type SetupStepState,
} from '../utils/overview-setup'
import type { Component } from 'vue'
import type { MailingComponentProps } from '../types/component'

defineProps<MailingComponentProps>()
defineOptions({ inheritAttrs: false })

type GateState = 'loading' | 'error' | 'ready'

const NEW_TEMPLATE_MODAL = 'MailingNewTemplateModal'
const NEW_TEMPLATE_MODAL_SIZE = 'lg'
const KEY_PREFIX = 'dms_mailing.setup.'
const SKELETON_ROWS = 4

const STEP_MARKER_CLASSES: Record<SetupStepState, string> = {
	done: 'bg-success/10 text-success ring-success/30',
	current: 'bg-primary text-inverted ring-primary',
	todo: 'bg-elevated text-muted ring-default',
}

const STEP_BUTTON_VARIANTS: Record<SetupStepState, 'solid' | 'outline'> = {
	done: 'outline',
	current: 'solid',
	todo: 'outline',
}

const { t } = useI18n()
const { open: openModal } = useModal()

const { data: facts, error, status, refresh } = useSetupFacts()
/**
 * The header's period selector sets up once the dashboard has: a server
 * render, which renders the dashboard once the facts are in, would otherwise
 * set the selector up first and render the cards with a period the browser's
 * cards do not have yet as they hydrate.
 */
const DashboardRendered = holdPageHeaderActions()
const isResumed = ref(false)

/** A failure shows once its retry is over; the facts read last stay meanwhile. */
const state = computed<GateState>(() => {
	if (facts.value) return 'ready'
	return error.value && status.value !== 'pending' ? 'error' : 'loading'
})

const steps = computed<SetupStep[]>(() =>
	facts.value ? setupSteps(facts.value) : [],
)
const isBlocking = computed(() => !!facts.value && needsSetup(facts.value))
const showsSetup = computed(() => isBlocking.value || isResumed.value)
const showsDashboard = computed(() => !!facts.value && !isBlocking.value)
const canResume = computed(
	() =>
		showsDashboard.value &&
		!isResumed.value &&
		!!facts.value &&
		!isSetupComplete(facts.value),
)

const key = (path: string): string => t(`${KEY_PREFIX}${path}`)

const errorActions = computed(() => [
	{
		label: key('retry'),
		icon: 'i-ph-arrows-clockwise',
		onClick: () => void refresh(),
	},
])

const stepDescription = (step: SetupStep): string =>
	key(`steps.${step.id}.${step.state === 'done' ? 'done' : 'description'}`)

function createTemplate(): void {
	const modal = openModal({
		title: t('dms_mailing.setup.create_template'),
		component: resolveComponent(NEW_TEMPLATE_MODAL) as Component,
		size: NEW_TEMPLATE_MODAL_SIZE,
	})
	const reread = () => refresh()
	void modal.result.then(reread, reread)
}
</script>

<template>
	<DmsCard
		v-if="state === 'loading' && !facts"
		:padded="false"
		aria-busy="true"
	>
		<div class="flex flex-col gap-3 p-6 sm:p-8">
			<USkeleton class="h-6 w-56" />
			<USkeleton v-for="row in SKELETON_ROWS" :key="row" class="h-10 w-full" />
		</div>
	</DmsCard>

	<DmsCard v-else-if="state === 'error' && !facts" :padded="false">
		<DmsEmptyState
			variant="error"
			:title="key('error_title')"
			:description="key('error_description')"
			:actions="errorActions"
		/>
	</DmsCard>

	<div v-else class="flex flex-col gap-4">
		<div v-if="canResume" class="flex justify-end">
			<UButton
				size="xs"
				color="neutral"
				variant="ghost"
				icon="i-ph-list-checks"
				:label="key('resume')"
				@click="isResumed = true"
			/>
		</div>

		<DmsCard v-if="showsSetup" :padded="false">
			<div
				class="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
			>
				<div class="flex flex-col items-start gap-3">
					<DmsIconWell icon="i-ph-envelope-simple" tone="primary" size="xl" />
					<h3 class="text-highlighted text-lg font-semibold">
						{{ key('title') }}
					</h3>
					<p class="text-muted max-w-[52ch] text-[13.5px] leading-relaxed">
						{{ key('description') }}
					</p>
					<div class="mt-1.5 flex flex-wrap items-center gap-2">
						<UButton
							icon="i-ph-plus"
							:label="key('create_template')"
							@click="createTemplate"
						/>
						<UPopover>
							<UButton
								color="neutral"
								variant="ghost"
								:label="key('how_it_works')"
							/>
							<template #content>
								<div class="flex max-w-80 flex-col gap-2 p-4 text-[13px]">
									<p class="text-highlighted font-semibold">
										{{ key('how_it_works') }}
									</p>
									<p class="text-muted leading-relaxed">
										{{ key('how_it_works_body') }}
									</p>
								</div>
							</template>
						</UPopover>
						<UButton
							v-if="isResumed && !isBlocking"
							color="neutral"
							variant="ghost"
							icon="i-ph-x"
							:label="key('hide')"
							@click="isResumed = false"
						/>
					</div>
				</div>

				<ol class="flex flex-col gap-1">
					<li v-for="step in steps" :key="step.id">
						<DmsListRow
							as="div"
							:title="key(`steps.${step.id}.title`)"
							:description="stepDescription(step)"
							:current="step.state === 'current'"
						>
							<template #leading>
								<span
									:class="STEP_MARKER_CLASSES[step.state]"
									class="grid size-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold ring"
								>
									<UIcon
										v-if="step.state === 'done'"
										name="i-ph-check"
										class="size-3.5"
										aria-hidden="true"
									/>
									<template v-else>{{ step.number }}</template>
								</span>
							</template>
							<template v-if="step.state !== 'done' && step.to" #trailing>
								<UButton
									size="sm"
									:variant="STEP_BUTTON_VARIANTS[step.state]"
									:color="step.state === 'current' ? 'primary' : 'neutral'"
									:label="key(`steps.${step.id}.action`)"
									@click="navigateDms(step.to)"
								/>
							</template>
						</DmsListRow>
					</li>
				</ol>
			</div>
		</DmsCard>

		<slot v-if="showsDashboard" />
	</div>
	<DashboardRendered />
</template>
