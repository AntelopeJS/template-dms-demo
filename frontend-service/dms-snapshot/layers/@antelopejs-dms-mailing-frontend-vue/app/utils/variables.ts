import type {
	Block,
	Condition,
	ConditionOperator,
	LocaleContent,
	TemplateChange,
	TemplateContent,
	TemplateContentResponse,
	VariableDefinition,
	VariableType,
} from '../types/mailing'
import { flattenBlocks } from './blocks/tree'
import { pathsInBlocks, textPaths } from './paths'

/**
 * `declared` — the content uses it and someone typed it;
 * `detected` — the content uses it, nobody declared it;
 * `unused` — declared but the content no longer references it.
 */
export type VariableUsage = 'declared' | 'detected' | 'unused'

export interface MergedVariable {
	path: string
	type: VariableType
	required: boolean
	usage: VariableUsage
}

const DEFAULT_TYPE: VariableType = 'string'

/**
 * One list for the variables panel: every path the content references, in the
 * order it was detected, enriched by its declaration when there is one, then
 * the declarations the content has stopped using.
 */
export function mergeVariables(
	detected: string[],
	declared: VariableDefinition[],
): MergedVariable[] {
	const byPath = new Map(declared.map((entry) => [entry.path, entry]))
	const used = detected.map((path) => {
		const declaration = byPath.get(path)
		return {
			path,
			type: declaration?.type ?? DEFAULT_TYPE,
			required: declaration?.required ?? false,
			usage: declaration ? ('declared' as const) : ('detected' as const),
		}
	})
	const seen = new Set(detected)
	const unused = declared
		.filter((entry) => !seen.has(entry.path))
		.map((entry) => ({
			path: entry.path,
			type: entry.type,
			required: entry.required,
			usage: 'unused' as const,
		}))
	return [...used, ...unused]
}

/** One side of a template's variables: what it declares and references. */
export interface VariableContract {
	variables: VariableDefinition[]
	detected: string[]
}

type ContractSource = Pick<
	TemplateContentResponse,
	| 'variables'
	| 'detectedVariables'
	| 'publishedVariables'
	| 'publishedDetectedVariables'
>

/** The draft's side: what the editor works on. */
export function workingContract(detail: ContractSource): VariableContract {
	return { variables: detail.variables, detected: detail.detectedVariables }
}

/**
 * What callers send against: the published declarations and the paths the
 * published content references; the working side for a template never
 * published.
 */
export function publishedContract(detail: ContractSource): VariableContract {
	return {
		variables: detail.publishedVariables ?? detail.variables,
		detected: detail.publishedDetectedVariables ?? detail.detectedVariables,
	}
}

/** Whether a pending change is about a variable declaration. */
export function isDeclarationChange(change: TemplateChange): boolean {
	return Boolean(change.variable)
}

/** A declaration saved from the variables panel. */
export interface VariableSubmission {
	value: VariableDefinition
	/** Also point the content's references to the old path at the new one. */
	shouldReplaceInContent: boolean
}

/** What a variable path may hold: letters, digits, `.`, `_` and `[]`. */
export const VARIABLE_PATH_PATTERN = /^[A-Za-z0-9_.[\]]+$/

const INVALID_PATH_CHARACTERS = /[^A-Za-z0-9_.[\]]+/g
const PATH_FILLER = '_'
const EDGE_FILLERS = /^_+|_+$/g
const FALLBACK_PATH_EXAMPLE = 'first_name'

export function isValidVariablePath(path: string): boolean {
	return VARIABLE_PATH_PATTERN.test(path.trim())
}

/** A valid path close to `path` (`first name` → `first_name`). */
export function suggestVariablePath(path: string): string {
	const suggestion = path
		.trim()
		.replace(INVALID_PATH_CHARACTERS, PATH_FILLER)
		.replace(EDGE_FILLERS, '')
	return suggestion || FALLBACK_PATH_EXAMPLE
}

const localesOf = (content: TemplateContent): LocaleContent[] =>
	Object.values(content.locales ?? {})

/** The paths a block itself references, its branches left out. */
function ownPaths(block: Block): string[] {
	const shallow: Block =
		block.type === 'if' ? { ...block, children: [], elseChildren: null } : block
	return pathsInBlocks([shallow])
}

/**
 * How many places of the content reference `path`, across every locale: each
 * block counts once, the subject and the preheader once each.
 */
export function countPathUsages(
	content: TemplateContent,
	path: string,
): number {
	return localesOf(content).reduce((total, locale) => {
		const envelope = [locale.subject, locale.preheader].filter((text) =>
			textPaths(text).includes(path),
		)
		const blocks = flattenBlocks(locale.blocks).filter((block) =>
			ownPaths(block).includes(path),
		)
		return total + envelope.length + blocks.length
	}, 0)
}

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g

function tokenPattern(path: string): RegExp {
	const escaped = path.replace(REGEXP_SPECIALS, '\\$&')
	return new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'g')
}

function renameInCondition(
	condition: Condition | null,
	from: string,
	to: string,
): void {
	if (condition?.path === from) condition.path = to
}

interface PathRename {
	from: string
	to: string
	rewrite: (text: string) => string
}

function renameInBlock(block: Block, rename: PathRename): void {
	const record = block as unknown as Record<string, unknown>
	Object.entries(record)
		.filter(([, value]) => typeof value === 'string')
		.forEach(([key, value]) => (record[key] = rename.rewrite(value as string)))
	renameInCondition(block.visibleIf, rename.from, rename.to)
	if (block.type === 'if')
		renameInCondition(block.condition, rename.from, rename.to)
	if (block.type === 'list' && block.source === rename.from)
		block.source = rename.to
}

/**
 * Points every reference to `from` at `to`, in place and in every locale:
 * `{{tokens}}`, list sources and condition paths.
 */
export function renameVariablePath(
	content: TemplateContent,
	from: string,
	to: string,
): void {
	const pattern = tokenPattern(from)
	const rename: PathRename = {
		from,
		to,
		rewrite: (text) => text.replace(pattern, () => `{{${to}}}`),
	}
	localesOf(content).forEach((locale) => {
		locale.subject = rename.rewrite(locale.subject)
		locale.preheader = rename.rewrite(locale.preheader)
		flattenBlocks(locale.blocks).forEach((block) =>
			renameInBlock(block, rename),
		)
	})
}

const BOOLEAN_OPERATORS: ConditionOperator[] = ['truthy', 'falsy']

const conditionsOf = (block: Block): Condition[] => [
	...(block.visibleIf ? [block.visibleIf] : []),
	...(block.type === 'if' ? [block.condition] : []),
]

interface TypeRule {
	type: VariableType
	matches: (block: Block, path: string) => boolean
}

const TYPE_RULES: TypeRule[] = [
	{
		type: 'array',
		matches: (block, path) => block.type === 'list' && block.source === path,
	},
	{
		type: 'boolean',
		matches: (block, path) =>
			conditionsOf(block).some(
				(condition) =>
					condition.path === path &&
					BOOLEAN_OPERATORS.includes(condition.operator),
			),
	},
]

/**
 * The type a declaration of `path` most likely has, from how the content uses
 * it: a list source is an array, a "filled in / empty" test a boolean.
 */
export function inferVariableType(
	content: TemplateContent,
	path: string,
): VariableType {
	const blocks = localesOf(content).flatMap((locale) =>
		flattenBlocks(locale.blocks),
	)
	const rule = TYPE_RULES.find((candidate) =>
		blocks.some((block) => candidate.matches(block, path)),
	)
	return rule?.type ?? DEFAULT_TYPE
}
