<!-- The legend of the required mark, worded and drawn as a DMS form's. -->
<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
	<p class="text-dimmed text-xs">
		<span class="text-error" aria-hidden="true">*</span>
		{{ t('dms.form.required_legend') }}
	</p>
</template>
