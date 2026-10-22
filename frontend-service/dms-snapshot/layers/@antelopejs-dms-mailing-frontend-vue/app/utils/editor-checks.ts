import type {
	Block,
	IfBlock,
	LocaleContent,
	TemplateContent,
	VariableDefinition,
} from '../types/mailing'
import { flattenBlocks } from './blocks/tree'
import { evaluateCondition } from './conditions'
import { pickLocale } from './locales'
import { isPresent, readPath } from './paths'
import { splitTokens } from './tokens'

export type EditorCheckState = 'ok' | 'warn' | 'info'

/** A check before the i18n pass: its key and the values it interpolates. */
export interface EditorCheck {
	id: string
	state: EditorCheckState
	key: string
	params: Record<string, string | number>
}

/** What the checks read: declarations, used paths, test data, blocks. */
export interface CheckInput {
	variables: VariableDefinition[]
	detected: string[]
	data: Record<string, unknown>
	blocks: Block[]
}

const CHECK_KEY_PREFIX = 'dms_mailing.editor.checks'
const WARNING_STATES: EditorCheckState[] = ['warn']

const check = (
	id: string,
	state: EditorCheckState,
	key: string,
	params: Record<string, string | number> = {},
): EditorCheck => ({ id, state, key: `${CHECK_KEY_PREFIX}.${key}`, params })

/** Paths the content uses that no declaration covers. */
export function undeclaredPaths(
	detected: string[],
	variables: VariableDefinition[],
): string[] {
	const declared = new Set(variables.map((variable) => variable.path))
	return detected.filter((path) => !declared.has(path))
}

/** Required declarations the data set does not provide. */
export function missingRequired(
	variables: VariableDefinition[],
	data: Record<string, unknown>,
): string[] {
	return variables
		.filter((variable) => variable.required)
		.map((variable) => variable.path)
		.filter((path) => !isPresent(readPath(data, path)))
}

/** What the content checks read: the draft and the workspace locales. */
export interface ContentCheckInput {
	content: TemplateContent
	/** The workspace locales, each of which recipients may ask for. */
	locales: string[]
	fallback: string
}

const FOOTER_TYPE = 'footer'

const footerCount = (locale: LocaleContent): number =>
	flattenBlocks(locale.blocks).filter((block) => block.type === FOOTER_TYPE)
		.length

/** A rule a locale's body breaks: the check key it reports under. */
interface BodyRule {
	key: string
	isBroken: (locale: LocaleContent) => boolean
}

const BODY_RULES: BodyRule[] = [
	{
		key: 'no_blocks',
		isBroken: (locale) =>
			!locale.blocks.some((block) => block.type !== FOOTER_TYPE),
	},
	{ key: 'no_footer', isBroken: (locale) => footerCount(locale) === 0 },
	{ key: 'many_footers', isBroken: (locale) => footerCount(locale) > 1 },
	{
		key: 'footer_not_last',
		isBroken: (locale) =>
			footerCount(locale) > 0 && locale.blocks.at(-1)?.type !== FOOTER_TYPE,
	},
]

const localeEntries = (content: TemplateContent): [string, LocaleContent][] =>
	Object.entries(content.locales)

/** Locales a publish is refused for: a send would go out without a subject. */
export function publishBlockers(content: TemplateContent): EditorCheck[] {
	return localeEntries(content)
		.filter(([, locale]) => !locale.subject.trim())
		.map(([code]) =>
			check(`subject-${code}`, 'warn', 'empty_subject', {
				locale: code.toUpperCase(),
			}),
		)
}

function bodyChecks(content: TemplateContent): EditorCheck[] {
	return localeEntries(content).flatMap(([code, locale]) =>
		BODY_RULES.filter((rule) => rule.isBroken(locale)).map((rule) =>
			check(`${rule.key}-${code}`, 'warn', rule.key, {
				locale: code.toUpperCase(),
			}),
		),
	)
}

/** Every text a locale shows: its envelope and each block's string fields. */
function localeTexts(locale: LocaleContent): string[] {
	const fields = flattenBlocks(locale.blocks).flatMap((block) =>
		Object.values(block as unknown as Record<string, unknown>),
	)
	return [
		locale.subject,
		locale.preheader,
		...fields.filter((value): value is string => typeof value === 'string'),
	]
}

function tokensOf(locale: LocaleContent, kind: 'token' | 'invalid'): string[] {
	return localeTexts(locale)
		.flatMap(splitTokens)
		.filter((part) => part.kind === kind)
		.map((part) => part.value)
}

/** `{{…}}` look-alikes the engine leaves as typed: customers would see them. */
function malformedTokenChecks(content: TemplateContent): EditorCheck[] {
	return localeEntries(content).flatMap(([code, locale]) =>
		[...new Set(tokensOf(locale, 'invalid'))].map((token) =>
			check(`token-${code}-${token}`, 'warn', 'invalid_token', {
				locale: code.toUpperCase(),
				token,
			}),
		),
	)
}

const isStructured = (value: unknown): boolean =>
	value !== null && typeof value === 'object' && !(value instanceof Date)

/** Tokens whose test value is an object or a list: they print as raw data. */
function structuredTokenChecks(
	content: TemplateContent,
	data: Record<string, unknown>,
): EditorCheck[] {
	const paths = localeEntries(content).flatMap(([, locale]) =>
		tokensOf(locale, 'token'),
	)
	return [...new Set(paths)]
		.filter((path) => isStructured(readPath(data, path)))
		.map((path) =>
			check(`structured-${path}`, 'warn', 'token_not_text', { path }),
		)
}

/** What the publish review warns about the content's `{{…}}` tokens. */
export function tokenChecks(
	content: TemplateContent,
	data: Record<string, unknown>,
): EditorCheck[] {
	return [
		...malformedTokenChecks(content),
		...structuredTokenChecks(content, data),
	]
}

function missingLocaleChecks(input: ContentCheckInput): EditorCheck[] {
	const present = Object.keys(input.content.locales)
	if (!present.length) return []
	return input.locales
		.filter((code) => !input.content.locales[code])
		.map((code) =>
			check(`locale-${code}`, 'warn', 'missing_locale', {
				locale: code.toUpperCase(),
				fallback: pickLocale(present, code, input.fallback).toUpperCase(),
			}),
		)
}

/** What the publish review warns about the draft's content itself. */
export function contentChecks(input: ContentCheckInput): EditorCheck[] {
	return [...bodyChecks(input.content), ...missingLocaleChecks(input)]
}

/** The failed checks the publish review warns about. */
export function publishChecks(input: CheckInput): EditorCheck[] {
	return [
		...undeclaredPaths(input.detected, input.variables).map((path) =>
			check(`undeclared-${path}`, 'warn', 'undeclared', { path }),
		),
		...missingRequired(input.variables, input.data).map((path) =>
			check(`required-${path}`, 'warn', 'required_missing', { path }),
		),
	]
}

function requiredCheck(input: CheckInput): EditorCheck[] {
	const required = input.variables.filter((variable) => variable.required)
	if (!required.length) return []
	const missing = missingRequired(input.variables, input.data)
	if (!missing.length)
		return [
			check('required', 'ok', 'required_covered', { count: required.length }),
		]
	return missing
		.filter((path) => !input.detected.includes(path))
		.map((path) =>
			check(`required-${path}`, 'warn', 'required_missing', { path }),
		)
}

function coverageChecks(input: CheckInput): EditorCheck[] {
	const undeclared = new Set(undeclaredPaths(input.detected, input.variables))
	return input.detected
		.filter((path) => !isPresent(readPath(input.data, path)))
		.map((path) =>
			check(
				`missing-${path}`,
				'warn',
				undeclared.has(path) ? 'missing_undeclared' : 'missing',
				{ path },
			),
		)
}

function conditionChecks(input: CheckInput): EditorCheck[] {
	return flattenBlocks(input.blocks)
		.filter((block): block is IfBlock => block.type === 'if')
		.map((block) => {
			const result = evaluateCondition(block.condition, input.data)
			return check(
				`condition-${block.id}`,
				'info',
				result ? 'condition_true' : 'condition_false',
				{ path: block.condition.path },
			)
		})
}

/** The Test data tab's checks: coverage, then how each condition evaluates. */
export function testDataChecks(input: CheckInput): EditorCheck[] {
	return [
		...requiredCheck(input),
		...coverageChecks(input),
		...conditionChecks(input),
	]
}

/** How many checks need a look: the Test data tab's badge. */
export function openIssueCount(checks: EditorCheck[]): number {
	return checks.filter((entry) => WARNING_STATES.includes(entry.state)).length
}
