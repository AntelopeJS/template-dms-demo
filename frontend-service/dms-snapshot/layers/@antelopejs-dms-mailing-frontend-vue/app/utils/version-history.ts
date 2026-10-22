import type { TemplateStatus, TemplateVersionSummary } from '../types/mailing'
import { describeChanges, NO_SOURCES } from './changes'
import type { ChangeTranslator } from './changes'

/** What a version's preview resolves with, from its footer buttons. */
export type VersionPreviewChoice = 'restore' | 'close'

/** Changes a history row names; the others are counted. */
export const SUMMARY_CHANGE_COUNT = 2

const VERSION_DATE_FORMAT: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: 'short',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
}

/** A history row's reading of what its version changed. */
export interface ChangeSummary {
	/** The first changes, one sentence each ("EN · Subject changed"). */
	named: string[]
	/** How many more the version brought. */
	more: number
}

export function changeSummary(
	version: Pick<TemplateVersionSummary, 'changes'>,
	t: ChangeTranslator,
): ChangeSummary {
	const lines = describeChanges(version.changes, NO_SOURCES, t)
	return {
		named: lines.slice(0, SUMMARY_CHANGE_COUNT).map((line) => line.text),
		more: Math.max(0, lines.length - SUMMARY_CHANGE_COUNT),
	}
}

/** Whether customers receive `version` right now. */
export function isLiveVersion(
	version: number,
	current: number,
	status: TemplateStatus | undefined,
): boolean {
	return status === 'live' && version === current
}

/** When a version was published, to the minute, in the reader's locale. */
export function formatVersionDate(date: string, locale: string): string {
	const time = new Date(date)
	if (Number.isNaN(time.getTime())) return ''
	return new Intl.DateTimeFormat(locale, VERSION_DATE_FORMAT).format(time)
}
