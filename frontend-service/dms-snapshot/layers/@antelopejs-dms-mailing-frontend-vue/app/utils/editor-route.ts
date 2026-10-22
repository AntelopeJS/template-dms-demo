import { TEMPLATES_PATH } from './pages'

const PATH_SEPARATOR = '/'

/**
 * The DMS state key the breadcrumb reads the record label from (the same one
 * the core's `usePageRecordLabel` writes).
 */
export const RECORD_LABEL_STATE_KEY = 'dms-page-record-label'

export interface EditorRouteQuery extends Record<string, string | undefined> {
	locale?: string
}

export interface EditorRoute {
	path: string
	query: EditorRouteQuery
}

/** Where the editor of `templateId` lives, optionally on one locale. */
export function editorRoute(templateId: string, locale?: string): EditorRoute {
	return {
		path: `${TEMPLATES_PATH}${PATH_SEPARATOR}${encodeURIComponent(templateId)}`,
		query: locale ? { locale } : {},
	}
}

export interface EditorRouteParams {
	id?: string | number
}

/**
 * The template id of the editor page: the `:id` route param the DMS hands the
 * component, else the last segment of the current path.
 */
export function templateIdFrom(
	params: EditorRouteParams | undefined,
	path: string,
): string {
	if (params?.id !== undefined && params.id !== '') return String(params.id)
	const last = path.split(PATH_SEPARATOR).filter(Boolean).at(-1) ?? ''
	return decodeURIComponent(last)
}

/** The record label the breadcrumb ends with: the template's name. */
export interface RecordLabel {
	path: string
	label: string
}

/** Builds the breadcrumb label for the page at `path`; no name clears it. */
export function recordLabelFor(
	path: string,
	name: string | undefined,
): RecordLabel | null {
	return name ? { path, label: name } : null
}
