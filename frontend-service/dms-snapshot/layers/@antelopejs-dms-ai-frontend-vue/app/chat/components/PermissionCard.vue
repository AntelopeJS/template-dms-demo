<script setup lang="ts">
import { computed, ref } from "vue";
import { useChatI18n } from "../composables/useChatI18n";
import { FEEDBACK_MAX_CHARS } from "../constants/protocol";
import type {
	PermissionAnswer,
	PermissionRequestData,
} from "../types/permission";
import type { PermissionRule } from "../types/protocol";
import {
	permissionCardText,
	permissionIcon,
	ruleLabelKey,
} from "../utils/permission-view";
import { namedArguments } from "../utils/tool-lexicon";
import DiffView from "./DiffView.vue";

interface Props {
	request: PermissionRequestData;
	isFocused: boolean;
}

interface Emits {
	answer: [answer: PermissionAnswer];
	focus: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const ONCE_SCOPE = "once";

const scope = ref<string>(ONCE_SCOPE);
const isSuggesting = ref(false);
const feedback = ref("");
const typedName = ref("");
const keepData = ref(false);

const text = computed(() => permissionCardText(props.request, t));
const icon = computed(() => permissionIcon(props.request));
const preview = computed(() => props.request.preview);
const isDestructive = computed(() => preview.value.type === "destructive");
const genericArgs = computed(() =>
	preview.value.type === "generic" ? namedArguments(preview.value.args) : [],
);

const scopes = computed(() =>
	props.request.ruleOptions.map((rule, index) => ({
		id: String(index),
		rule,
		label: t(ruleLabelKey(rule), { value: rule.value }),
	})),
);

const confirmText = computed<string>(() =>
	preview.value.type === "destructive" ? (preview.value.confirmText ?? "") : "",
);

const canAllow = computed<boolean>(() => {
	if (!isDestructive.value || keepData.value) return true;
	return (
		confirmText.value === "" || typedName.value.trim() === confirmText.value
	);
});

const allowLabel = computed(() =>
	keepData.value
		? t("dms_ai.panel.approvals.remove_code_only")
		: text.value.allowLabel,
);

function chosenRule(): PermissionRule | undefined {
	return scopes.value.find((option) => option.id === scope.value)?.rule;
}

function allow(): void {
	if (!canAllow.value) return;
	const rule = chosenRule();
	emit(
		"answer",
		rule === undefined
			? { decision: "allow_once", keepData: keepData.value }
			: { decision: "allow_rule", rule },
	);
}

function deny(): void {
	emit("answer", { decision: "deny" });
}

function sendSuggestion(): void {
	const value = feedback.value.trim();
	if (value === "") return;
	emit("answer", { decision: "deny", feedback: value });
}

defineExpose({ allow, deny });
</script>

<template>
	<div
		class="perm"
		:class="{ 'is-focused': isFocused, 'is-danger': isDestructive }"
		:data-request-id="request.requestId"
	>
		<div class="perm__head">
			<span class="perm__icon" :data-kind="request.kind">
				<UIcon :name="icon" />
			</span>
			<div class="perm__titles">
				<div class="perm__title">{{ text.title }}</div>
				<div v-if="text.sub || preview.type === 'diff'" class="perm__sub">
					{{ text.sub }}
					<template v-if="preview.type === 'diff'">
						·
						<span class="plus">+{{ preview.added }}</span>
						<span class="minus">−{{ preview.removed }}</span>
					</template>
				</div>
			</div>
			<UBadge
				v-if="
					preview.type === 'destructive' &&
					preview.consequence === 'deletes_data'
				"
				size="sm"
				color="error"
				variant="subtle"
				:label="t('dms_ai.panel.approvals.data_loss')"
			/>
			<UButton
				v-if="!isFocused"
				size="xs"
				color="neutral"
				variant="outline"
				@click="emit('focus')"
			>
				{{ t("dms_ai.panel.approvals.review") }}
				<UKbd value="J" size="sm" />
			</UButton>
		</div>

		<template v-if="isFocused">
			<p v-if="text.why" class="perm__why">{{ text.why }}</p>
			<div class="perm__body">
				<DiffView v-if="preview.type === 'diff'" :hunks="preview.hunks" />
				<div v-else-if="preview.type === 'command'" class="perm__cmd">
					<span class="perm__prompt">$</span>
					<span>{{ preview.command }}</span>
				</div>
				<div v-else-if="preview.type === 'web'" class="perm__cmd">
					<UIcon name="i-ph-globe" />
					<span>{{ preview.url }}</span>
				</div>
				<label
					v-else-if="preview.type === 'destructive' && confirmText"
					class="perm__confirm"
				>
					<span>
						{{ t("dms_ai.panel.approvals.type_to_confirm_before") }}
						<code class="inline-code">{{ confirmText }}</code>
						{{ t("dms_ai.panel.approvals.type_to_confirm_after") }}
					</span>
					<UInput
						v-model="typedName"
						size="sm"
						class="perm__confirm-input"
						:disabled="keepData"
						:placeholder="confirmText"
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
				<dl v-else-if="genericArgs.length > 0" class="perm__kv">
					<template v-for="arg in genericArgs" :key="arg.name">
						<dt>{{ arg.name }}</dt>
						<dd>{{ arg.value }}</dd>
					</template>
				</dl>
			</div>

			<div
				v-if="!request.alwaysAsk && scopes.length > 0"
				class="perm__scope"
				role="radiogroup"
				:aria-label="t('dms_ai.panel.approvals.scope_label')"
			>
				<label class="scope-opt">
					<input v-model="scope" type="radio" :value="ONCE_SCOPE" />
					{{ text.onceLabel }}
				</label>
				<label v-for="option in scopes" :key="option.id" class="scope-opt">
					<input v-model="scope" type="radio" :value="option.id" />
					<span class="scope-opt__label">{{ option.label }}</span>
					<small>{{ t("dms_ai.panel.approvals.this_chat") }}</small>
				</label>
			</div>
			<div
				v-if="preview.type === 'destructive' && preview.canKeepData"
				class="perm__scope"
			>
				<label class="scope-opt">
					<input v-model="keepData" type="checkbox" />
					{{ t("dms_ai.panel.approvals.keep_data") }}
					<small>{{ t("dms_ai.panel.approvals.recommended") }}</small>
				</label>
			</div>

			<div v-if="isSuggesting" class="perm__suggest">
				<UTextarea
					v-model="feedback"
					:rows="2"
					autoresize
					:maxlength="FEEDBACK_MAX_CHARS"
					:placeholder="t('dms_ai.panel.approvals.suggest_placeholder')"
					class="w-full"
				/>
				<div class="perm__suggest-row">
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						:label="t('dms_ai.common.cancel')"
						@click="isSuggesting = false"
					/>
					<UButton
						size="xs"
						color="neutral"
						variant="outline"
						:disabled="feedback.trim() === ''"
						:label="t('dms_ai.panel.approvals.send_suggestion')"
						@click="sendSuggestion"
					/>
				</div>
			</div>

			<div class="perm__foot">
				<UButton
					v-if="!isSuggesting && !isDestructive"
					size="sm"
					color="neutral"
					variant="ghost"
					icon="i-ph-chat-circle-dots"
					:label="t('dms_ai.panel.approvals.suggest')"
					@click="isSuggesting = true"
				/>
				<span class="perm__spacer" />
				<UButton
					size="sm"
					color="neutral"
					variant="outline"
					class="perm__deny"
					@click="deny"
				>
					{{ t("dms_ai.panel.approvals.deny") }}
					<UKbd value="N" size="sm" />
				</UButton>
				<UButton
					size="sm"
					:color="isDestructive && !keepData ? 'error' : 'secondary'"
					class="perm__allow"
					:disabled="!canAllow"
					@click="allow"
				>
					{{ allowLabel }}
					<UKbd v-if="!isDestructive" value="↵" size="sm" />
				</UButton>
			</div>
		</template>
	</div>
</template>

<style scoped>
.perm {
	border: 1px solid var(--ui-border-accented);
	border-radius: var(--ai-radius-md);
	background: var(--ui-bg-elevated);
	box-shadow: var(--dms-shadow-card);
	overflow: hidden;
}

.perm.is-focused {
	border-color: var(--dms-warning-line);
	box-shadow: 0 0 0 3px var(--dms-warning-tint);
}

.perm.is-danger {
	border-color: var(--dms-error-line);
}

.perm.is-danger.is-focused {
	box-shadow: 0 0 0 3px var(--dms-error-tint);
}

.perm__head {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 11px 12px;
}

.perm.is-focused .perm__head {
	padding-bottom: 0;
}

.perm__icon {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	flex: none;
	border-radius: var(--ai-radius-sm);
	background: var(--dms-warning-tint);
	color: var(--ui-warning);
	font-size: 16px;
}

.perm__icon[data-kind="destructive"] {
	background: var(--dms-error-tint);
	color: var(--ui-error);
}

.perm__icon[data-kind="builder"] {
	background: var(--dms-accent-tint);
	color: var(--dms-accent);
}

.perm__titles {
	flex: 1;
	min-width: 0;
}

.perm__title {
	font-size: 13px;
	font-weight: 600;
	line-height: 1.35;
	color: var(--ui-text-highlighted);
	overflow-wrap: anywhere;
}

.perm__sub {
	margin-top: 2px;
	font: 450 11.5px var(--ai-font-mono);
	color: var(--ui-text-muted);
	overflow-wrap: anywhere;
}

.perm__why {
	margin: 0;
	padding: 8px 12px 0 50px;
	font-size: 12.5px;
	line-height: 1.5;
	color: var(--ui-text-muted);
}

.perm__body {
	padding: 10px 12px 0;
}

.perm__body:empty {
	display: none;
}

.perm__cmd {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-bg-field);
	font: 500 12px var(--ai-font-mono);
	color: var(--ui-text-highlighted);
	overflow-wrap: anywhere;
}

.perm__prompt {
	color: var(--ui-text-dimmed);
}

.perm__confirm {
	display: grid;
	gap: 6px;
	font-size: 12px;
	color: var(--ui-text-toned);
}

.perm__kv {
	display: grid;
	grid-template-columns: minmax(56px, max-content) minmax(0, 1fr);
	gap: 3px 10px;
	margin: 0;
	padding: 8px 10px;
	border: 1px solid var(--ui-border);
	border-radius: var(--ai-radius-sm);
	background: var(--dms-bg-field);
	font: 450 11.5px / 1.5 var(--ai-font-mono);
	color: var(--ui-text-toned);
}

.perm__kv dt {
	color: var(--ui-text-dimmed);
}

.perm__kv dd {
	margin: 0;
	overflow-wrap: anywhere;
}

.perm__scope {
	display: grid;
	gap: 2px;
	padding: 10px 12px 0;
}

.scope-opt {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 28px;
	padding: 0 8px;
	border-radius: 6px;
	font-size: 12.5px;
	color: var(--ui-text-toned);
	cursor: pointer;
}

.scope-opt:hover {
	background: var(--ai-bg-hover);
}

.scope-opt input {
	accent-color: var(--ai);
}

.scope-opt__label {
	min-width: 0;
	overflow-wrap: anywhere;
}

.scope-opt small {
	margin-left: auto;
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.perm__suggest {
	display: grid;
	gap: 6px;
	padding: 10px 12px 0;
}

.perm__suggest-row {
	display: flex;
	justify-content: flex-end;
	gap: 6px;
}

.perm__foot {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 10px 12px 12px;
}

.perm__spacer {
	flex: 1;
}
</style>
