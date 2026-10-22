import type { InjectionKey, Ref } from 'vue'
import { isPresent, readPath } from './paths'

/**
 * `token` is a `{{path}}` the engine fills in; `invalid` looks like one but
 * breaks its grammar, so the engine leaves it as typed.
 */
export type TextPartKind = 'text' | 'token' | 'invalid'

export interface TextPart {
	kind: TextPartKind
	value: string
}

/** A token read against test data: its value when the data provides one. */
export interface ResolvedToken {
	isPresent: boolean
	text: string
}

/** The test data the paper renders tokens with; `null` shows the paths. */
export type TokenData = Record<string, unknown> | null

/**
 * Provided by the canvas in Data mode so every `MailingTokenText` on the paper
 * swaps its tokens for values without each block renderer passing data down.
 */
export const TOKEN_DATA_KEY: InjectionKey<Ref<TokenData>> = Symbol(
	'dms-mailing-token-data',
)

/**
 * The engine's token grammar (`src/engine/tokens.ts` `TOKEN_PATTERN`), with
 * a capture around the whole token so `split` keeps it.
 */
const TOKEN_SPLIT = /(\{\{\s*[A-Za-z0-9_.[\]]+\s*\}\})/
const TOKEN_LIKE_SPLIT = /(\{\{[^}]*\}\})/
const TOKEN_MARKER_LENGTH = 2
const SPLIT_TOKEN_STEP = 2

/**
 * How a token without a value prints, as the engine's interpolation modes:
 * `preview` keeps it visible, `send` blanks it as a real e-mail does.
 */
export type InterpolationMode = 'preview' | 'send'

const MISSING_TOKEN: Record<InterpolationMode, (path: string) => string> = {
	preview: (path) => `{{${path}}}`,
	send: () => '',
}

/** A piece of text with tokens kept exactly as typed (spaces included). */
export interface RawSegment {
	kind: TextPartKind
	raw: string
	/** The trimmed path of a token; the raw text otherwise. */
	value: string
}

const isSplitMatch = (index: number): boolean => index % SPLIT_TOKEN_STEP === 1

function literalSegments(text: string): RawSegment[] {
	return text
		.split(TOKEN_LIKE_SPLIT)
		.map((raw, index) => ({
			kind: isSplitMatch(index) ? ('invalid' as const) : ('text' as const),
			raw,
			value: raw,
		}))
		.filter((segment) => segment.raw)
}

/**
 * Splits `text` into literal text, tokens and token look-alikes, keeping each
 * token's raw spelling: the token field's highlight layer must line up
 * character for character with the textarea.
 */
export function splitRawSegments(text: string): RawSegment[] {
	return text.split(TOKEN_SPLIT).flatMap((raw, index) =>
		isSplitMatch(index)
			? [
					{
						kind: 'token' as const,
						raw,
						value: raw.slice(TOKEN_MARKER_LENGTH, -TOKEN_MARKER_LENGTH).trim(),
					},
				]
			: literalSegments(raw),
	)
}

export function splitTokens(text: string): TextPart[] {
	return splitRawSegments(text).map(({ kind, value }) => ({ kind, value }))
}

function formatValue(value: unknown): string {
	return value instanceof Date ? value.toISOString() : String(value)
}

/** Reads one token path in `data`, formatted like the engine prints it. */
export function resolveToken(
	path: string,
	data: Record<string, unknown>,
): ResolvedToken {
	const value = readPath(data, path)
	return isPresent(value)
		? { isPresent: true, text: formatValue(value) }
		: { isPresent: false, text: path }
}

/** Replaces every token of `text` with its value, as the engine does. */
export function interpolateText(
	text: string,
	data: Record<string, unknown>,
	mode: InterpolationMode = 'preview',
): string {
	return splitTokens(text)
		.map((part) => {
			if (part.kind !== 'token') return part.value
			const resolved = resolveToken(part.value, data)
			return resolved.isPresent
				? resolved.text
				: MISSING_TOKEN[mode](part.value)
		})
		.join('')
}
