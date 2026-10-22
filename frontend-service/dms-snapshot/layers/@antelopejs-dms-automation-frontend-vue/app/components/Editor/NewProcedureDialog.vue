<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// "New procedure" from the builder: name it, pick what starts it, and land on
// a draft with its trigger placed (AU-11).

const props = defineProps<{ apiUrl: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'created', id: string): void }>()

const { $authFetch } = useAuthFetch()
const { t } = useI18n()

const STARTERS = [
	{ value: 'webhook', icon: 'i-ph-webhooks-logo', label: 'webhook' },
	{ value: 'schedule.cron', icon: 'i-ph-clock', label: 'schedule' },
	{ value: 'manual', icon: 'i-ph-play', label: 'manual' },
] as const

const NAME_ID = 'new-procedure-name'
const ROW = { layout: 'form', spacing: 'list', inset: false } as const

const name = ref('')
const trigger = ref<(typeof STARTERS)[number]['value']>('webhook')
const description = ref('')
const submitting = ref(false)
// A missing name shows under its field; a refused request too when the API
// names the field, a toast otherwise.
const fieldErrors = useFieldErrors({ fields: { name: NAME_ID } })

const starterItems = computed(() =>
	STARTERS.map((starter) => ({
		value: starter.value,
		icon: starter.icon,
		label: t(`dms_automation.newProcedure.starts.${starter.label}`),
		description: t(`dms_automation.newProcedure.starts.${starter.label}Hint`),
	})),
)

watch(open, (isOpen) => {
	if (!isOpen) return
	name.value = ''
	trigger.value = 'webhook'
	description.value = ''
	fieldErrors.clear()
})
watch(name, () => fieldErrors.clear('name'))

async function submit() {
	if (!name.value.trim()) {
		await fieldErrors.setError('name', t('dms_automation.newProcedure.nameRequired'))
		return
	}
	submitting.value = true
	try {
		const res = await $authFetch<{ _id: string }>(`${props.apiUrl}/procedures/new`, {
			method: 'POST',
			body: { name: name.value.trim(), trigger: trigger.value, description: description.value },
		})
		open.value = false
		emit('created', res._id)
	} catch (e) {
		await fieldErrors.handleApiError(e, { toastTitle: 'dms_automation.common.actionFailed' })
	} finally {
		submitting.value = false
	}
}
</script>

<template>
	<UModal v-model:open="open" :title="$t('dms_automation.newProcedure.title')" :description="$t('dms_automation.newProcedure.subtitle')">
		<template #body>
			<form class="flex flex-col gap-4" @submit.prevent="submit">
				<DmsFieldRow v-bind="ROW" :label="$t('dms_automation.newProcedure.name')" :label-for="NAME_ID" required>
					<div class="grid gap-1.5">
						<DmsInputText
							:id="NAME_ID"
							v-model="name"
							autofocus
							class="w-full"
							:placeholder="$t('dms_automation.newProcedure.namePlaceholder')"
							v-bind="fieldErrors.aria('name')"
						/>
						<DmsFieldError :id="fieldErrors.errorId('name')" :message="fieldErrors.errors.name" />
					</div>
				</DmsFieldRow>
				<DmsFieldRow
					v-bind="ROW"
					:label="$t('dms_automation.newProcedure.startsWhen')"
					:description="$t('dms_automation.newProcedure.startsWhenHint')"
					required
				>
					<DmsChoiceCards v-model="trigger" :items="starterItems" />
				</DmsFieldRow>
				<DmsFieldRow v-bind="ROW" :label="$t('dms_automation.newProcedure.description')" label-for="new-procedure-description">
					<DmsTextarea id="new-procedure-description" v-model="description" :rows="2" class="w-full" />
				</DmsFieldRow>
				<DmsFormRequiredLegend />
			</form>
		</template>
		<template #footer>
			<div class="flex w-full justify-end gap-2">
				<UButton variant="outline" color="neutral" @click="open = false">{{ $t('dms_automation.common.cancel') }}</UButton>
				<UButton color="primary" :loading="submitting" @click="submit">{{ $t('dms_automation.newProcedure.submit') }}</UButton>
			</div>
		</template>
	</UModal>
</template>
