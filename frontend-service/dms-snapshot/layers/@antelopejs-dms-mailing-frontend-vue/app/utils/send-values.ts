import type { VariableDefinition, VariableType } from '../types/mailing'
import { deepClone } from './clone'
import { isPresent, readPath } from './paths'

/**
 * How a value of a real send is entered: typed, ticked, or a list or an object
 * taken as is from the test data (neither has a one-line form).
 */
export type SendValueKind = 'text' | 'boolean' | 'list' | 'object'

/** One variable the real-send dialog asks a value for. */
export interface SendField {
	path: string
	required: boolean
	kind: SendValueKind
}

/** The dialog's values, by variable path. */
export type SendValues = Record<string, unknown>

const PATH_SEPARATOR = '.'
const ARRAY_SUFFIX = '[]'
const RESERVED_SEGMENTS = ['__proto__', 'constructor', 'prototype']

const KIND_BY_TYPE: Partial<Record<VariableType, SendValueKind>> = {
	boolean: 'boolean',
	array: 'list',
}

function kindOfValue(value: unknown): SendValueKind {
	if (typeof value === 'boolean') return 'boolean'
	if (Array.isArray(value)) return 'list'
	return value !== null && typeof value === 'object' ? 'object' : 'text'
}

function normalize(path: string): string {
	const trimmed = path.trim()
	return trimmed.endsWith(ARRAY_SUFFIX)
		? trimmed.slice(0, -ARRAY_SUFFIX.length)
		: trimmed
}

/** Whether `path` holds `other` (`order` holds `order.number`). */
function isAncestor(path: string, other: string): boolean {
	return other.startsWith(`${path}${PATH_SEPARATOR}`)
}

/**
 * The variables a real send needs values for: the declared ones first, then
 * the ones the content uses without declaring them, never required. An
 * undeclared path whose children are asked for (`{{order}}` next to
 * `{{order.number}}`) gets no field of its own: its children build it.
 */
export function sendFields(
	declared: VariableDefinition[],
	detected: string[],
	testData: Record<string, unknown>,
): SendField[] {
	const fields = declared.map((variable) => ({
		path: normalize(variable.path),
		required: variable.required,
		kind:
			KIND_BY_TYPE[variable.type] ??
			kindOfValue(readPath(testData, variable.path)),
	}))
	const known = new Set(fields.map((field) => field.path))
	const paths = [...new Set(detected.map(normalize))].filter(
		(path) => path && !known.has(path),
	)
	const every = [...known, ...paths]
	const undeclared = paths
		.filter((path) => !every.some((other) => isAncestor(path, other)))
		.map((path) => ({
			path,
			required: false,
			kind: kindOfValue(readPath(testData, path)),
		}))
	return [...fields, ...undeclared]
}

const INITIAL_VALUES: Record<SendValueKind, (value: unknown) => unknown> = {
	text: (value) => (isPresent(value) ? String(value) : ''),
	boolean: (value) => Boolean(value),
	list: (value) => (isPresent(value) ? value : undefined),
	object: (value) => (isPresent(value) ? value : undefined),
}

/** The values the dialog opens with: the template's test data. */
export function initialSendValues(
	fields: SendField[],
	testData: Record<string, unknown>,
): SendValues {
	return Object.fromEntries(
		fields.map((field) => [
			field.path,
			INITIAL_VALUES[field.kind](readPath(testData, field.path)),
		]),
	)
}

const HAS_VALUE: Record<SendValueKind, (value: unknown) => boolean> = {
	text: (value) => typeof value === 'string' && value.trim() !== '',
	boolean: () => true,
	list: isPresent,
	object: isPresent,
}

/** The required variables still without a value: the send waits for them. */
export function missingRequiredPaths(
	fields: SendField[],
	values: SendValues,
): string[] {
	return fields
		.filter((field) => field.required)
		.filter((field) => !HAS_VALUE[field.kind](values[field.path]))
		.map((field) => field.path)
}

function setPath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	const segments = path.split(PATH_SEPARATOR)
	if (segments.some((segment) => RESERVED_SEGMENTS.includes(segment))) return
	const last = segments.pop() as string
	const parent = segments.reduce<Record<string, unknown>>((node, segment) => {
		const child = node[segment]
		if (child === null || typeof child !== 'object') node[segment] = {}
		return node[segment] as Record<string, unknown>
	}, target)
	parent[last] = value
}

function depth(field: SendField): number {
	return field.path.split(PATH_SEPARATOR).length
}

/**
 * The `data` a real send carries: every value given, nested by its path. The
 * shallow paths go first, copied, so a value typed for `order.number` always
 * wins over the `order` object taken from the test data.
 */
export function buildSendData(
	fields: SendField[],
	values: SendValues,
): Record<string, unknown> {
	const data: Record<string, unknown> = {}
	fields
		.filter((field) => HAS_VALUE[field.kind](values[field.path]))
		.sort((left, right) => depth(left) - depth(right))
		.forEach((field) =>
			setPath(data, field.path, deepClone(values[field.path])),
		)
	return data
}
