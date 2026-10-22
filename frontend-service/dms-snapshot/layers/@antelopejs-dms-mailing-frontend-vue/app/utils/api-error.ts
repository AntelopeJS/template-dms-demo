/** What a failed `$authFetch` call carries, as far as the module reads it. */
export interface FetchFailure {
	statusCode?: number
	status?: number
	data?: unknown
	message?: string
}

export const HTTP_CONFLICT = 409

const asFailure = (error: unknown): FetchFailure =>
	error !== null && typeof error === 'object' ? (error as FetchFailure) : {}

/** The HTTP status of a failed call; 0 for a network failure. */
export function apiErrorStatus(error: unknown): number {
	const failure = asFailure(error)
	return failure.statusCode ?? failure.status ?? 0
}

/**
 * The message a failed call answers: the backend's i18n key (`$dms_mailing…`)
 * when it sent one, else the error's own text, for `processApiMessage`.
 */
export function apiErrorMessage(error: unknown): string {
	const failure = asFailure(error)
	const data = failure.data
	if (data && typeof data === 'object') {
		const message = (data as Record<string, unknown>).message
		if (typeof message === 'string') return message
	}
	if (typeof data === 'string' && data) return data
	return failure.message ?? String(error)
}
