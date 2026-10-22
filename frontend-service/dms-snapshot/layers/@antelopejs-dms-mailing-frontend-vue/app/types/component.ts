/**
 * Identity the DMS page renderer hands to every component it mounts. Optional
 * here because the mailing components are also mounted directly by our own
 * pages and drawers, outside the renderer.
 */
export interface MailingComponentProps {
	componentId?: string
	pageId?: string
}

export interface GalleryPagination {
	pageIndex: number
	pageSize: number
	total: number
	setPage: (index: number) => void
	setPageSize: (size: number) => void
}

/**
 * The slice of the DMS `TableViewDisplayContext` the gallery display consumes.
 * Declared structurally so the layer does not import from the dms-ui layer.
 */
export interface GalleryDisplayContext<T> {
	items: T[]
	loading: boolean
	pagination: GalleryPagination
	options?: Record<string, unknown>
	refresh: () => Promise<void> | void
}
