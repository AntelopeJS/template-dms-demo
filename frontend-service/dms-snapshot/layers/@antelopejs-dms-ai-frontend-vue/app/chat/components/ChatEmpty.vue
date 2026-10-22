<script setup lang="ts">
import { computed } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import type { CurrentPage } from "../types/conversation";
import type { Scope } from "../types/protocol";
import { pageName, pageSuggestions } from "../utils/suggestions";

interface Props {
	page: CurrentPage | null;
	scope: Scope;
}

interface Emits {
	suggest: [text: string];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const name = computed(() => pageName(props.page));
const suggestions = computed(() =>
	pageSuggestions(props.page).map((suggestion) => ({
		...suggestion,
		text: t(suggestion.textKey, { page: name.value }),
	})),
);
</script>

<template>
	<div class="cb-empty">
		<span class="ai-tile ai-tile--lg" aria-hidden="true">
			<UIcon name="i-ph-sparkle" />
		</span>
		<h3>
			{{
				name
					? t("dms_ai.panel.empty.title_page", { page: name })
					: t("dms_ai.panel.empty.title")
			}}
		</h3>
		<p>{{ t(`dms_ai.panel.empty.text_${scope}`) }}</p>
		<div class="cb-suggest">
			<button
				v-for="suggestion in suggestions"
				:key="suggestion.textKey"
				type="button"
				@click="emit('suggest', suggestion.text)"
			>
				<UIcon :name="suggestion.icon" class="cb-suggest__icon" />
				<span class="cb-suggest__text">{{ suggestion.text }}</span>
				<UBadge
					v-if="suggestion.isReadOnly"
					size="sm"
					color="neutral"
					variant="subtle"
					:label="t('dms_ai.panel.empty.read_only')"
				/>
			</button>
		</div>
	</div>
</template>

<style scoped>
.cb-empty {
	display: grid;
	justify-items: center;
	gap: 6px;
	margin: auto 0;
	padding: 28px 20px;
	text-align: center;
}

.ai-tile--lg {
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	border-radius: 12px;
	background: var(--ai-tint);
	box-shadow:
		inset 0 0 0 1px var(--ai-line),
		0 0 0 6px var(--ai-tint);
	color: var(--ai);
	font-size: 22px;
}

.cb-empty h3 {
	margin: 10px 0 0;
	font-size: 17px;
	font-weight: 650;
	line-height: 1.3;
	letter-spacing: -0.02em;
	color: var(--ui-text-highlighted);
}

.cb-empty p {
	max-width: 34ch;
	margin: 0;
	font-size: 13px;
	color: var(--ui-text-muted);
}

.cb-suggest {
	display: grid;
	gap: 6px;
	width: 100%;
	margin-top: 14px;
	text-align: left;
}

.cb-suggest button {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 36px;
	padding: 6px 10px;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-surface-card);
	color: var(--ui-text-toned);
	font-size: 12.5px;
	text-align: left;
	cursor: pointer;
}

.cb-suggest button:hover {
	border-color: var(--ai-line);
	color: var(--ui-text-highlighted);
}

.cb-suggest__icon {
	width: 15px;
	height: 15px;
	flex: none;
	color: var(--ai);
}

.cb-suggest__text {
	flex: 1;
}
</style>
