import type { VariableDefinition, VariableType } from '../types/mailing'

const TOKEN_OPEN = '{{'
const TOKEN_CLOSE = '}}'
const PATH_CHARACTERS = /^[A-Za-z0-9_.[\]]*$/
const PATH_CHARACTER = /[A-Za-z0-9_.[\]]/
const MAX_SUGGESTIONS = 8

/** An open `{{` the caret is typing a path after. */
export interface TokenQuery {
	/** Index of the `{{`. */
	start: number
	query: string
}

/**
 * The token being typed at `caret`: a `{{` before it, not yet closed, followed
 * only by path characters. `null` when the caret is not inside one.
 */
export function tokenQueryAt(text: string, caret: number): TokenQuery | null {
	const before = text.slice(0, caret)
	const start = before.lastIndexOf(TOKEN_OPEN)
	if (start < 0) return null
	const typed = before.slice(start + TOKEN_OPEN.length)
	const query = typed.trimStart()
	if (typed.includes(TOKEN_CLOSE) || !PATH_CHARACTERS.test(query)) return null
	return { start, query }
}

export type SuggestionStatus = 'declared' | 'undeclared' | 'system'

export interface PathSuggestion {
	path: string
	type: VariableType | null
	status: SuggestionStatus
}

/** What the autocomplete offers: declared paths, used ones, system ones. */
export interface SuggestionSources {
	variables: VariableDefinition[]
	detected: string[]
	system: string[]
}

function allSuggestions(sources: SuggestionSources): PathSuggestion[] {
	const declared = new Set(sources.variables.map((variable) => variable.path))
	return [
		...sources.variables.map((variable) => ({
			path: variable.path,
			type: variable.type,
			status: 'declared' as const,
		})),
		...sources.detected
			.filter((path) => !declared.has(path) && !sources.system.includes(path))
			.map((path) => ({ path, type: null, status: 'undeclared' as const })),
		...sources.system.map((path) => ({
			path,
			type: null,
			status: 'system' as const,
		})),
	]
}

/**
 * The paths matching `query`: those starting with it first, then those
 * containing it, each group in source order; at most eight.
 */
export function suggestPaths(
	query: string,
	sources: SuggestionSources,
): PathSuggestion[] {
	const needle = query.toLowerCase()
	const matching = allSuggestions(sources).filter((entry) =>
		entry.path.toLowerCase().includes(needle),
	)
	const starts = matching.filter((entry) =>
		entry.path.toLowerCase().startsWith(needle),
	)
	const rest = matching.filter((entry) => !starts.includes(entry))
	return [...starts, ...rest].slice(0, MAX_SUGGESTIONS)
}

/** A text after an insertion, and where the caret goes. */
export interface TextEdit {
	text: string
	caret: number
}

/**
 * Replaces the token being typed (from its `{{` through the path characters
 * after the caret and a closing `}}` if there is one) with `{{path}}`.
 */
export function insertSuggestion(
	text: string,
	query: TokenQuery,
	caret: number,
	path: string,
): TextEdit {
	let end = caret
	while (end < text.length && PATH_CHARACTER.test(text.charAt(end))) end += 1
	if (text.startsWith(TOKEN_CLOSE, end)) end += TOKEN_CLOSE.length
	const token = `${TOKEN_OPEN}${path}${TOKEN_CLOSE}`
	return {
		text: `${text.slice(0, query.start)}${token}${text.slice(end)}`,
		caret: query.start + token.length,
	}
}

/** Inserts `{{path}}` at the caret (a click in the Variables tab). */
export function insertTokenAt(
	text: string,
	caret: number,
	path: string,
): TextEdit {
	const token = `${TOKEN_OPEN}${path}${TOKEN_CLOSE}`
	return {
		text: `${text.slice(0, caret)}${token}${text.slice(caret)}`,
		caret: caret + token.length,
	}
}
