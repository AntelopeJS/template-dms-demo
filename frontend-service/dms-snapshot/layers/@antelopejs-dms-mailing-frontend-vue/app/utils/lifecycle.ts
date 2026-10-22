import type { TemplateRow, TemplateStatus } from '../types/mailing'

export type LifecycleAction = 'unpublish' | 'archive' | 'restore'

export interface LifecycleButton {
	action: LifecycleAction
	icon: string
}

const BUTTONS: Record<LifecycleAction, LifecycleButton> = {
	unpublish: { action: 'unpublish', icon: 'i-ph-eye-slash' },
	archive: { action: 'archive', icon: 'i-ph-archive' },
	restore: { action: 'restore', icon: 'i-ph-arrow-u-up-left' },
}

const TRANSITIONS: Record<TemplateStatus, LifecycleAction[]> = {
	draft: ['archive'],
	live: ['unpublish', 'archive'],
	archived: ['restore'],
}

export function lifecycleActions(status: TemplateStatus): LifecycleButton[] {
	return (TRANSITIONS[status] ?? []).map((action) => BUTTONS[action])
}

/** What an action stamps on the template besides its status, at `now`. */
const STAMPS: Partial<
	Record<LifecycleAction, (now: Date) => Partial<TemplateRow>>
> = {
	unpublish: (now) => ({ unpublishedAt: now.toISOString() }),
}

/**
 * The template once `action` went through: its new status and the moments
 * the editor's notice dates, as the server recorded them.
 */
export function afterLifecycle(
	template: TemplateRow,
	action: LifecycleAction,
	status: TemplateStatus,
	now = new Date(),
): TemplateRow {
	return { ...template, ...STAMPS[action]?.(now), status }
}

/** Publishing is refused from `archived`; restore the template first. */
export function canPublish(status: TemplateStatus): boolean {
	return status !== 'archived'
}

/** Where the draft's autosave stands. */
export type SaveStatus = 'idle' | 'saving' | 'error' | 'conflict'

/** What decides whether "Publish changes" (and ⌘↵) can run. */
export interface PublishableInput {
	status: TemplateStatus
	changeCount: number
	dirty: number
}

/**
 * Whether publishing would do anything: a live template needs a change; a
 * draft or unpublished one goes live; an archived one must be restored first.
 */
export function isPublishable(input: PublishableInput): boolean {
	if (!canPublish(input.status)) return false
	if (input.status !== 'live') return true
	return input.changeCount > 0 || input.dirty > 0
}

/** The status a template reads as: a draft that was once live is unpublished. */
export type StatusKey = TemplateStatus | 'unpublished'

export function statusKeyOf(
	status: TemplateStatus,
	version: number,
): StatusKey {
	return status === 'draft' && version > 0 ? 'unpublished' : status
}

export type NoticeKind =
	| 'conflict'
	| 'save_error'
	| 'unpublished'
	| 'live_changes'
	| 'live_clean'
	| 'never_published'

export type NoticeAction =
	'compare' | 'discard' | 'reload' | 'overwrite' | 'retry' | 'republish'

export type NoticeTone = 'primary' | 'warning' | 'error'

/** The band under the toolbar: what it says, its tone and its actions. */
export interface EditorNotice {
	kind: NoticeKind
	tone: NoticeTone
	actions: NoticeAction[]
}

export interface NoticeInput {
	status: TemplateStatus
	version: number
	changeCount: number
	saveStatus: SaveStatus
}

const DRAFT_ACTIONS: NoticeAction[] = ['compare', 'discard']

const SAVE_NOTICES: Partial<Record<SaveStatus, EditorNotice>> = {
	conflict: {
		kind: 'conflict',
		tone: 'error',
		actions: ['reload', 'overwrite'],
	},
	error: { kind: 'save_error', tone: 'error', actions: ['retry'] },
}

function contentNotice(input: NoticeInput): EditorNotice | null {
	const draftActions = input.changeCount > 0 ? DRAFT_ACTIONS : []
	if (input.version === 0)
		return input.changeCount > 0
			? { kind: 'never_published', tone: 'primary', actions: [] }
			: null
	if (input.status === 'live')
		return input.changeCount > 0
			? { kind: 'live_changes', tone: 'primary', actions: draftActions }
			: { kind: 'live_clean', tone: 'primary', actions: [] }
	if (input.status === 'draft')
		return {
			kind: 'unpublished',
			tone: 'warning',
			actions: [...draftActions, 'republish'],
		}
	return null
}

/**
 * Which notice the editor shows: a draft that could not be saved first, then
 * the template's reading — nothing published yet, live, or unpublished.
 */
export function noticeFor(input: NoticeInput): EditorNotice | null {
	return SAVE_NOTICES[input.saveStatus] ?? contentNotice(input)
}

/** The moment a notice dates: the unpublish, else the last publication. */
export function noticeMomentOf(
	kind: NoticeKind,
	template: Pick<TemplateRow, 'publishedAt' | 'unpublishedAt' | 'updatedAt'>,
): string | null | undefined {
	if (kind !== 'unpublished') return template.publishedAt
	return template.unpublishedAt ?? template.updatedAt
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
}
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
}

/** A publication moment, split for "published Sep 29 at 09:14". */
export interface PublishedMoment {
	date: string
	time: string
}

export function publishedMoment(
	iso: string | null | undefined,
	locale: string,
): PublishedMoment | null {
	if (!iso) return null
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return null
	return {
		date: date.toLocaleDateString(locale, DATE_FORMAT),
		time: date.toLocaleTimeString(locale, TIME_FORMAT),
	}
}

/** The subject length mail clients show in full; past it, a warning tint. */
export const SUBJECT_RECOMMENDED_LENGTH = 60
