<script setup lang="ts">
import FormFieldRow from '../build/components/FormFieldRow.vue'
import { MAX_RECIPIENTS } from '../utils/recipients'

interface RecipientsFieldProps {
	/** Line under the chips, before the counter. */
	hint: string
}

defineProps<RecipientsFieldProps>()

const recipients = defineModel<string[]>({ required: true })

const { t } = useI18n()
</script>

<template>
	<FormFieldRow :label="t('dms_mailing.test_send.recipients')" required>
		<template #default="{ id }">
			<DmsInputTags
				:id="id"
				v-model="recipients"
				item-type="email"
				:max="MAX_RECIPIENTS"
				:placeholder="t('dms_mailing.test_send.add_address')"
			/>
		</template>
		<template #help>
			<span class="flex items-center justify-between gap-3">
				<span>{{ hint }}</span>
				<span
					class="font-mono"
					:class="recipients.length >= MAX_RECIPIENTS ? 'text-warning' : ''"
					aria-live="polite"
				>
					{{ recipients.length }} / {{ MAX_RECIPIENTS }}
				</span>
			</span>
		</template>
	</FormFieldRow>
</template>
