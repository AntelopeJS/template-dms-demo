<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChangeFileStatus, DiffFile } from "./types";
import {
	countLines,
	renderHunks,
	splitPath,
	type RenderedLine,
} from "./utils/diff";

type DiffViewVariant = "flush" | "boxed";

interface Props {
	files: DiffFile[];
	/**
	 * `flush` sits edge to edge in a card (files ruled by a top border),
	 * `boxed` is a rounded frame of its own (a drawer, a dialog).
	 */
	variant?: DiffViewVariant;
}

const props = withDefaults(defineProps<Props>(), { variant: "boxed" });

const { t } = useI18n();

const EXPANDED_LINE_LIMIT = 200;
const DEFAULT_FILE_ICON = "i-ph-file";
const FILE_ICONS: Record<string, string> = {
	ts: "i-ph-file-ts",
	tsx: "i-ph-file-tsx",
	js: "i-ph-file-js",
	mjs: "i-ph-file-js",
	vue: "i-ph-file-vue",
	css: "i-ph-file-css",
	html: "i-ph-file-html",
	md: "i-ph-file-md",
	json: "i-ph-brackets-curly",
};
const STATUS_BADGES: Partial<Record<ChangeFileStatus, string>> = {
	added: "dms_ai.views.diff.new",
	deleted: "dms_ai.views.diff.deleted",
};
const STATUS_BADGE_TONES: Partial<Record<ChangeFileStatus, string>> = {
	added: "success",
	deleted: "error",
};
const LINE_CLASSES: Record<RenderedLine["kind"], string> = {
	context: "text-toned",
	add: "bg-(--dms-success-tint) text-highlighted shadow-[inset_2px_0_0_var(--ui-success)]",
	remove:
		"bg-(--dms-error-tint) text-highlighted shadow-[inset_2px_0_0_var(--ui-error)]",
	hunk: "bg-(--dms-accent-tint) text-dimmed",
};
const MARKER_CLASSES: Record<RenderedLine["kind"], string> = {
	context: "text-dimmed",
	add: "text-success",
	remove: "text-error",
	hunk: "text-dimmed",
};
const VARIANT_CLASSES: Record<DiffViewVariant, string> = {
	flush: "border-t border-default",
	boxed: "rounded-md border border-default overflow-hidden",
};

interface FileView {
	key: string;
	file: DiffFile;
	directory: string;
	name: string;
	icon: string;
	added: number;
	removed: number;
	lines: RenderedLine[];
	badge?: string;
	badgeTone?: string;
}

function extensionOf(name: string): string {
	return name.split(".").at(-1)?.toLowerCase() ?? "";
}

function toFileView(file: DiffFile, index: number): FileView {
	const { directory, name } = splitPath(file.path);
	const counts = countLines(file.hunks);
	const status = file.status;
	return {
		key: `${index}:${file.path}`,
		file,
		directory,
		name,
		icon: FILE_ICONS[extensionOf(name)] ?? DEFAULT_FILE_ICON,
		added: file.added ?? counts.added,
		removed: file.removed ?? counts.removed,
		lines: renderHunks(file.hunks),
		badge: status ? STATUS_BADGES[status] : undefined,
		badgeTone: status ? STATUS_BADGE_TONES[status] : undefined,
	};
}

const views = computed(() => props.files.map(toFileView));

const collapsed = ref<Record<string, boolean>>({});

function isExpanded(view: FileView, index: number): boolean {
	const override = collapsed.value[view.key];
	if (override !== undefined) return !override;
	return index === 0 || view.lines.length <= EXPANDED_LINE_LIMIT;
}

function toggle(view: FileView, index: number): void {
	collapsed.value = {
		...collapsed.value,
		[view.key]: isExpanded(view, index),
	};
}
</script>

<template>
	<div
		class="flex flex-col font-mono text-[11.5px] leading-[1.65]"
		data-diff-view
	>
		<section
			v-for="(view, index) in views"
			:key="view.key"
			:class="[
				VARIANT_CLASSES[props.variant],
				props.variant === 'boxed' && index > 0 && 'mt-2',
			]"
			class="bg-(--dms-bg-field)"
			data-diff-file
		>
			<header
				class="text-toned bg-(--dms-bg-muted) flex h-[30px] items-center gap-[7px] pl-2.5 pr-2"
				:class="isExpanded(view, index) && 'border-default border-b'"
			>
				<UIcon
					:name="view.icon"
					class="text-muted size-3.5 shrink-0"
					:aria-hidden="true"
				/>
				<span class="min-w-0 truncate" :title="view.file.path">
					<span v-text="view.directory" />
					<b class="text-highlighted font-semibold" v-text="view.name" />
				</span>
				<DmsStatusPill
					v-if="view.badge"
					:label="t(view.badge)"
					:tone="view.badgeTone"
					dot="none"
					size="sm"
				/>
				<span class="ms-auto flex shrink-0 gap-1.5 font-semibold">
					<span v-if="view.added > 0" class="text-success">
						+{{ view.added }}
					</span>
					<span v-if="view.removed > 0" class="text-error">
						−{{ view.removed }}
					</span>
				</span>
				<UButton
					:icon="isExpanded(view, index) ? 'i-ph-caret-up' : 'i-ph-caret-down'"
					color="neutral"
					variant="ghost"
					size="xs"
					square
					:aria-expanded="isExpanded(view, index)"
					:aria-label="
						t(
							isExpanded(view, index)
								? 'dms_ai.views.diff.collapse'
								: 'dms_ai.views.diff.expand',
							{ path: view.file.path },
						)
					"
					@click="toggle(view, index)"
				/>
			</header>
			<template v-if="isExpanded(view, index)">
				<p v-if="view.file.isBinary" class="text-muted px-3 py-2 font-sans">
					{{ t("dms_ai.views.diff.binary") }}
				</p>
				<p
					v-else-if="view.lines.length === 0"
					class="text-muted px-3 py-2 font-sans"
				>
					{{ t("dms_ai.views.diff.no_lines") }}
				</p>
				<div v-else class="overflow-x-auto py-1" role="table">
					<div
						v-for="line in view.lines"
						:key="line.key"
						class="grid min-w-max grid-cols-[36px_14px_minmax(0,1fr)] whitespace-pre"
						:class="LINE_CLASSES[line.kind]"
						:data-line-kind="line.kind"
						role="row"
					>
						<span
							class="text-dimmed select-none pr-1.5 text-right"
							role="cell"
							v-text="line.number"
						/>
						<span
							class="select-none text-center"
							:class="MARKER_CLASSES[line.kind]"
							role="cell"
							v-text="line.marker"
						/>
						<span class="pr-3" role="cell" v-text="line.text" />
					</div>
				</div>
			</template>
		</section>
	</div>
</template>
