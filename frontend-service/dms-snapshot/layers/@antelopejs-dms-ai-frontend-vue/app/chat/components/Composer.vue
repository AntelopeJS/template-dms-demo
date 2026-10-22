<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
	NEWLINE_HOTKEY_MODIFIER,
	SEND_HOTKEY,
} from "../constants/conversation";
import { useChatI18n } from "../composables/useChatI18n";
import { useComposerAttachments } from "../composables/useComposerAttachments";
import type { CurrentPage } from "../types/conversation";
import type {
	ApprovalMode,
	ConversationModeState,
	FullAutoDuration,
	Scope,
} from "../types/protocol";
import {
	formatBytes,
	isInlineImage,
	type PendingAttachment,
} from "../utils/attachments";
import { shortcutLabel } from "../utils/platform";
import { pageChipLabel } from "../utils/suggestions";
import FullAutoDialog from "./FullAutoDialog.vue";

interface Props {
	isDisabled: boolean;
	isRunning: boolean;
	mode: ConversationModeState;
	builderAvailable: boolean;
	page: CurrentPage | null;
	/** "9.6k tokens · this chat", "new chat", "offline". */
	usageLabel: string;
	placeholder: string;
}

interface Emits {
	submit: [
		content: string,
		attachments: PendingAttachment[],
		includePage: boolean,
	];
	stop: [];
	setScope: [scope: Scope];
	setMode: [mode: ApprovalMode];
	startFullAuto: [duration: FullAutoDuration];
	openSettings: [];
}

interface ModeLook {
	icon: string;
	labelKey: string;
	descriptionKey: string;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useChatI18n();

const MAX_HEIGHT_PX = 160;
const SCOPES: readonly Scope[] = ["safe", "vibe"];
const MODES: readonly ApprovalMode[] = ["normal", "acceptEdits", "plan"];
const MODE_LOOKS: Record<ApprovalMode, ModeLook> = {
	normal: {
		icon: "i-ph-hand-palm",
		labelKey: "dms_ai.common.mode.normal",
		descriptionKey: "dms_ai.panel.composer.mode_desc.normal",
	},
	acceptEdits: {
		icon: "i-ph-pencil-simple-line",
		labelKey: "dms_ai.common.mode.acceptEdits",
		descriptionKey: "dms_ai.panel.composer.mode_desc.acceptEdits",
	},
	plan: {
		icon: "i-ph-list-checks",
		labelKey: "dms_ai.common.mode.plan",
		descriptionKey: "dms_ai.panel.composer.mode_desc.plan",
	},
};
const SCOPE_ICONS: Record<Scope, string> = {
	safe: "i-ph-shield-check",
	vibe: "i-ph-code",
};
const HISTORY_KEY = "j";
const historyKbd = shortcutLabel(HISTORY_KEY);

const draft = ref("");
const isPageIncluded = ref(true);
const isFullAutoOpen = ref(false);
const isFocused = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const files = useComposerAttachments(t, () => props.isDisabled);

const pageLabel = computed(() => pageChipLabel(props.page));
const isSendDisabled = computed(
	() =>
		props.isDisabled ||
		(draft.value.trim() === "" && files.attachments.value.length === 0),
);
const modeLook = computed(
	() => MODE_LOOKS[props.mode.mode] ?? MODE_LOOKS.normal,
);
const isFullAuto = computed(() => props.mode.fullAuto !== null);

watch(
	() => props.page?.path,
	() => (isPageIncluded.value = true),
);

const scopeItems = computed(() =>
	SCOPES.map((scope) => ({
		label: t(`dms_ai.common.scope.${scope}`),
		description: t(
			scope === "safe" && !props.builderAvailable
				? "dms_ai.panel.composer.scope_desc.safe_unavailable"
				: `dms_ai.panel.composer.scope_desc.${scope}`,
		),
		icon: SCOPE_ICONS[scope],
		type: "checkbox" as const,
		checked: props.mode.generationMode === scope,
		disabled: scope === "safe" && !props.builderAvailable,
		onSelect: (): void => emit("setScope", scope),
	})),
);

const modeItems = computed(() => [
	[{ type: "label" as const, label: t("dms_ai.panel.composer.mode_menu") }],
	MODES.map((mode) => ({
		label: t(MODE_LOOKS[mode].labelKey),
		description: t(MODE_LOOKS[mode].descriptionKey),
		icon: MODE_LOOKS[mode].icon,
		type: "checkbox" as const,
		checked: !isFullAuto.value && props.mode.mode === mode,
		onSelect: (): void => emit("setMode", mode),
	})),
	[
		{
			label: t("dms_ai.panel.composer.full_auto_item"),
			description: t("dms_ai.panel.composer.mode_desc.auto"),
			icon: "i-ph-lightning",
			color: "error" as const,
			onSelect: (): void => {
				isFullAutoOpen.value = true;
			},
		},
	],
	[
		{
			label: t("dms_ai.panel.composer.default_mode"),
			icon: "i-ph-gear-six",
			onSelect: (): void => emit("openSettings"),
		},
	],
]);

function autoGrow(): void {
	const el = textareaRef.value;
	if (el === null) return;
	el.style.height = "auto";
	el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
}

function submitDraft(): void {
	if (isSendDisabled.value) return;
	emit("submit", draft.value, files.attachments.value, isPageIncluded.value);
	draft.value = "";
	files.clear();
	void nextTick(autoGrow);
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key !== SEND_HOTKEY || event[NEWLINE_HOTKEY_MODIFIER]) return;
	if (event.isComposing) return;
	event.preventDefault();
	submitDraft();
}

function onPaste(event: ClipboardEvent): void {
	const pasted = event.clipboardData?.files;
	if (pasted === undefined || pasted.length === 0) return;
	event.preventDefault();
	void files.add(pasted);
}

function onFileChange(event: Event): void {
	const input = event.target as HTMLInputElement;
	if (input.files !== null) void files.add(input.files);
	input.value = "";
}

function setDraft(text: string): void {
	draft.value = text;
	void nextTick(() => {
		autoGrow();
		textareaRef.value?.focus();
	});
}

defineExpose({
	focus: () => textareaRef.value?.focus(),
	setDraft,
});
</script>

<template>
	<form
		class="cb-composer composer"
		@submit.prevent="submitDraft"
		@dragenter="files.onDragEnter"
		@dragover="files.onDragOver"
		@dragleave="files.onDragLeave"
		@drop="files.onDrop"
	>
		<div
			class="cb-input"
			:class="{ 'is-focus': isFocused, 'is-drop': files.isDragging.value }"
		>
			<div
				v-if="
					(page && pageLabel && isPageIncluded) ||
					files.attachments.value.length > 0
				"
				class="cb-input__chips"
			>
				<span
					v-if="page && pageLabel && isPageIncluded"
					class="att is-page"
					:title="t('dms_ai.panel.composer.page_chip_hint')"
				>
					<UIcon name="i-ph-browser" />
					{{ pageLabel }}
					<button
						type="button"
						:aria-label="t('dms_ai.panel.composer.remove_page')"
						@click="isPageIncluded = false"
					>
						<UIcon name="i-ph-x" />
					</button>
				</span>
				<span v-for="att in files.attachments.value" :key="att.id" class="att">
					<img
						v-if="isInlineImage(att.mimeType) && att.dataUrl"
						:src="att.dataUrl"
						:alt="att.name"
						class="att__thumb"
					/>
					<UIcon v-else name="i-ph-file" />
					<span class="att__name">{{ att.name }}</span>
					<span class="att__size">{{ formatBytes(att.size) }}</span>
					<button
						type="button"
						:aria-label="
							t('dms_ai.panel.composer.remove_file', { name: att.name })
						"
						@click="files.remove(att.id)"
					>
						<UIcon name="i-ph-x" />
					</button>
				</span>
			</div>
			<p v-if="files.error.value" class="cb-input__error" role="alert">
				{{ files.error.value }}
			</p>
			<p v-if="files.isDragging.value" class="cb-input__drop">
				{{ t("dms_ai.panel.composer.drop_files") }}
			</p>
			<textarea
				ref="textareaRef"
				v-model="draft"
				rows="1"
				:placeholder="placeholder"
				:aria-label="t('dms_ai.panel.composer.aria')"
				:disabled="isDisabled"
				@keydown="onKeydown"
				@input="autoGrow"
				@paste="onPaste"
				@focus="isFocused = true"
				@blur="isFocused = false"
			/>
			<div class="cb-input__bar">
				<UButton
					size="sm"
					color="neutral"
					variant="ghost"
					square
					icon="i-ph-paperclip"
					:disabled="isDisabled"
					:aria-label="t('dms_ai.panel.composer.attach')"
					:title="t('dms_ai.panel.composer.attach')"
					@click="fileInputRef?.click()"
				/>
				<UDropdownMenu
					:items="scopeItems"
					:content="{ side: 'top', align: 'start' }"
				>
					<button
						type="button"
						class="cb-mode-btn"
						:class="{ 'is-safe': mode.generationMode === 'safe' }"
						:title="
							t(`dms_ai.panel.composer.scope_desc.${mode.generationMode}`)
						"
					>
						<UIcon :name="SCOPE_ICONS[mode.generationMode]" />
						{{ t(`dms_ai.common.scope.${mode.generationMode}`) }}
						<UIcon name="i-ph-caret-down" />
					</button>
				</UDropdownMenu>
				<UDropdownMenu
					:items="modeItems"
					:content="{ side: 'top', align: 'start' }"
				>
					<button
						type="button"
						class="cb-mode-btn"
						:class="{ 'is-danger': isFullAuto }"
					>
						<UIcon :name="isFullAuto ? 'i-ph-lightning' : modeLook.icon" />
						{{
							isFullAuto ? t("dms_ai.common.mode.auto") : t(modeLook.labelKey)
						}}
						<UIcon name="i-ph-caret-down" />
					</button>
				</UDropdownMenu>
				<span class="cb-input__spacer" />
				<UButton
					v-if="isRunning"
					size="sm"
					color="neutral"
					variant="outline"
					square
					icon="i-ph-stop"
					class="cb-send composer-stop"
					:aria-label="t('dms_ai.panel.composer.stop')"
					:title="t('dms_ai.panel.composer.stop_hint')"
					@click="emit('stop')"
				/>
				<UButton
					type="submit"
					size="sm"
					color="secondary"
					square
					:icon="isRunning ? 'i-ph-queue' : 'i-ph-arrow-up'"
					class="cb-send composer-send"
					:disabled="isSendDisabled"
					:aria-label="t('dms_ai.panel.composer.send')"
					:title="
						t(
							isRunning
								? 'dms_ai.panel.composer.queue_hint'
								: 'dms_ai.panel.composer.send',
						)
					"
				/>
			</div>
		</div>
		<input
			ref="fileInputRef"
			type="file"
			multiple
			class="cb-composer__file"
			aria-hidden="true"
			tabindex="-1"
			@change="onFileChange"
		/>
		<div class="cb-composer__hint">
			<span>
				<UKbd value="↵" size="sm" />
				{{
					t(
						isRunning
							? "dms_ai.panel.composer.hint_queue"
							: "dms_ai.panel.composer.hint_send",
					)
				}}
			</span>
			<span>
				<UKbd value="⇧↵" size="sm" />
				{{ t("dms_ai.panel.composer.hint_newline") }}
			</span>
			<span v-if="isRunning">
				<UKbd value="esc" size="sm" />
				{{ t("dms_ai.panel.composer.hint_stop") }}
			</span>
			<span v-else>
				<UKbd :value="historyKbd" size="sm" />
				{{ t("dms_ai.panel.composer.hint_history") }}
			</span>
			<span class="cb-composer__usage">{{ usageLabel }}</span>
		</div>
		<FullAutoDialog
			v-model:open="isFullAutoOpen"
			@confirm="(duration) => emit('startFullAuto', duration)"
		/>
	</form>
</template>

<style scoped>
.cb-composer {
	padding: 10px 12px 12px;
}

.cb-input {
	border: 1px solid var(--ui-border-accented);
	border-radius: 12px;
	background: var(--dms-bg-field);
	transition:
		border-color 150ms,
		box-shadow 150ms;
}

.cb-input.is-focus {
	border-color: var(--ai-line);
	box-shadow: 0 0 0 3px var(--ai-tint);
}

.cb-input.is-drop {
	border-style: dashed;
	border-color: var(--ai);
	background: var(--ai-tint);
}

.cb-input__chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding: 8px 8px 0;
}

.att {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	max-width: 100%;
	height: 26px;
	padding: 0 4px 0 6px;
	border: 1px solid var(--ui-border);
	border-radius: 7px;
	background: var(--dms-surface-card);
	font-size: 12px;
	color: var(--ui-text-toned);
}

.att > button {
	display: grid;
	place-items: center;
	width: 18px;
	height: 18px;
	padding: 0;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: var(--ui-text-dimmed);
	cursor: pointer;
}

.att > button:hover {
	background: var(--ai-bg-hover);
	color: var(--ui-text-highlighted);
}

.att.is-page {
	border-color: var(--dms-accent-line);
	background: var(--dms-accent-tint);
	color: var(--dms-accent);
	font: 500 11px var(--ai-font-mono);
}

.att__thumb {
	width: 18px;
	height: 18px;
	border-radius: 4px;
	object-fit: cover;
}

.att__name {
	max-width: 160px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.att__size {
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.cb-input__error,
.cb-input__drop {
	margin: 6px 10px 0;
	font-size: 12px;
}

.cb-input__error {
	color: var(--ui-error);
}

.cb-input__drop {
	color: var(--ai);
	font-weight: 600;
}

.cb-input textarea {
	display: block;
	width: 100%;
	min-height: 44px;
	max-height: 160px;
	padding: 10px 12px 4px;
	border: 0;
	outline: 0;
	resize: none;
	background: transparent;
	color: var(--ui-text-highlighted);
	font: inherit;
	font-size: 13.5px;
	line-height: 1.5;
}

.cb-input textarea::placeholder {
	color: var(--ui-text-dimmed);
}

.cb-input__bar {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 4px 6px 6px;
}

.cb-input__spacer {
	flex: 1;
}

.cb-mode-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	height: 26px;
	padding: 0 8px;
	border: 1px solid transparent;
	border-radius: 7px;
	background: transparent;
	color: var(--ui-text-muted);
	font-size: 12px;
	font-weight: 550;
	white-space: nowrap;
	cursor: pointer;
}

.cb-mode-btn:hover {
	background: var(--ai-bg-hover);
	color: var(--ui-text-highlighted);
}

.cb-mode-btn.is-safe {
	color: var(--ui-success);
}

.cb-mode-btn.is-danger {
	border-color: var(--dms-error-line);
	background: var(--dms-error-tint);
	color: var(--ui-error);
}

.cb-composer__file {
	display: none;
}

.cb-composer__hint {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 10px;
	margin-top: 7px;
	padding: 0 2px;
	font: 500 10.5px var(--ai-font-mono);
	color: var(--ui-text-dimmed);
}

.cb-composer__hint > span {
	display: inline-flex;
	align-items: center;
	gap: 3px;
}

.cb-composer__usage {
	margin-left: auto;
}
</style>
