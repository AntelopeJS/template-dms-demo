import { readPath } from './paths'
import type { VariableType } from '../types/mailing'

export interface SnippetVariable {
	path: string
	type: VariableType
}

export interface SendSnippetInput {
	slug: string
	locale: string
	/**
	 * The paths the content uses, declared or only detected, and the system
	 * URLs its footer links need (`utils/system-variables.ts`).
	 */
	variables: SnippetVariable[]
	/** The template's test data: example values where it has them. */
	testData: Record<string, unknown>
}

type VariableTree = Record<string, unknown>

const EXAMPLE_VALUES: Record<VariableType, unknown> = {
	string: '…',
	text: '…',
	number: 0,
	money: 0,
	date: '2026-01-31',
	url: 'https://…',
	boolean: true,
	array: [],
}

const ARRAY_SUFFIX = '[]'
const PATH_SEPARATOR = '.'
const INDENT = '  '
const JSON_INDENT = 2
const QUOTED_IDENTIFIER_KEY = /"([A-Za-z_$][\w$]*)":/g

const isTree = (value: unknown): value is VariableTree =>
	value !== null && typeof value === 'object' && !Array.isArray(value)

/** A list item path (`order.items[].name`) stands for its list. */
function rootVariable(variable: SnippetVariable): SnippetVariable {
	const at = variable.path.indexOf(ARRAY_SUFFIX)
	return at < 0 ? variable : { path: variable.path.slice(0, at), type: 'array' }
}

/** Sets `value` at a dotted path, never over a branch a deeper path built. */
function setPath(tree: VariableTree, path: string, value: unknown): void {
	const keys = path.split(PATH_SEPARATOR)
	const leaf = keys.pop() as string
	const parent = keys.reduce<VariableTree>((node, key) => {
		if (!isTree(node[key])) node[key] = {}
		return node[key] as VariableTree
	}, tree)
	if (!isTree(parent[leaf])) parent[leaf] = value
}

/** The variables a send passes, as one object of example values. */
export function exampleVariables(input: SendSnippetInput): VariableTree {
	const tree: VariableTree = {}
	input.variables
		.map(rootVariable)
		.filter((variable) => variable.path)
		.forEach((variable) => {
			const example = readPath(input.testData, variable.path)
			setPath(
				tree,
				variable.path,
				example ?? EXAMPLE_VALUES[variable.type] ?? EXAMPLE_VALUES.string,
			)
		})
	return tree
}

function literal(value: unknown): string {
	return JSON.stringify(value, null, JSON_INDENT)
		.replace(QUOTED_IDENTIFIER_KEY, '$1:')
		.split('\n')
		.join(`\n${INDENT}`)
}

/**
 * The `SendTemplate` call that sends this template from code: every
 * parameter the interface requires, and the variables its content uses.
 */
export function sendSnippet(input: SendSnippetInput): string {
	return [
		`await SendTemplate(${JSON.stringify(input.slug)}, {`,
		`${INDENT}tenantId,`,
		`${INDENT}to: customer.email,`,
		`${INDENT}locale: ${JSON.stringify(input.locale)},`,
		`${INDENT}variables: ${literal(exampleVariables(input))},`,
		'});',
	].join('\n')
}
