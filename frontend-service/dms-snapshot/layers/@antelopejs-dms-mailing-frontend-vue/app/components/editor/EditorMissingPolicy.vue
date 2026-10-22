<script setup lang="ts">
import { SETTINGS_PATH } from '../../utils/pages'
import { computed, onMounted } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'

const SETTINGS_PERMISSION = 'modules.mailing.configure.settings'
const KEY = 'dms_mailing.editor'

const { t } = useI18n()
const { hasPermission, refreshIfStale } = usePermissions()
const { session } = useEditorContext()

const canManage = computed(() => hasPermission(SETTINGS_PERMISSION))

const policy = computed(() =>
	t(
		session.state.blockOnMissingVariables
			? `${KEY}.template_tab.subject_help_block`
			: `${KEY}.template_tab.subject_help_send`,
	),
)

onMounted(() => void refreshIfStale())
</script>

<template>
	<p class="text-muted flex flex-wrap items-center gap-x-1.5 text-xs">
		<UIcon name="i-ph-info" class="size-3.5 shrink-0" />
		<span>{{ policy }}</span>
		<UButton
			v-if="canManage"
			size="xs"
			variant="link"
			color="primary"
			class="p-0"
			trailing-icon="i-ph-arrow-up-right"
			@click="navigateDms(SETTINGS_PATH)"
		>
			{{ t(`${KEY}.test_data.policy_link`) }}
		</UButton>
	</p>
</template>
