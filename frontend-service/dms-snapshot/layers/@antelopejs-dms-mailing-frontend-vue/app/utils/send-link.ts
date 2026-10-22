import type { SendResult } from '../composables/useMailingApi'
import { SENDS_PATH } from './pages'

/** The DMS table's deep-link key: the send log opens that send's drawer. */
const RECORD_QUERY_KEY = 'record'

export interface SendLogRoute {
	path: string
	query: Record<string, string>
}

/**
 * Where a send toast's "View in the send log" leads: the send itself when one
 * went out, the log otherwise.
 */
export function sendLogRoute(results: SendResult[]): SendLogRoute {
	const sent = results.filter((result) => !result.error && result.sendId)
	const only = sent.length === 1 ? sent[0] : undefined
	return {
		path: SENDS_PATH,
		query: only ? { [RECORD_QUERY_KEY]: only.sendId } : {},
	}
}

/** One send of the log, its drawer open. */
export function sendRoute(sendId: string): SendLogRoute {
	return { path: SENDS_PATH, query: { [RECORD_QUERY_KEY]: sendId } }
}
