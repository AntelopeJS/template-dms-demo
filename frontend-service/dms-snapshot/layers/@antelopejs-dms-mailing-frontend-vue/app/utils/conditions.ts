import type { Condition, ConditionOperator } from '../types/mailing'
import { readPath } from './paths'

export const OPERATORS: ConditionOperator[] = [
	'truthy',
	'falsy',
	'eq',
	'ne',
	'gt',
	'lt',
]
export const OPERATORS_WITH_VALUE: ConditionOperator[] = [
	'eq',
	'ne',
	'gt',
	'lt',
]

const OPERATOR_LABEL_PREFIX = 'dms_mailing.editor.operators'
const EMPTY_VALUE_PLACEHOLDER = '…'

export type OperatorTranslator = (key: string) => string

export function describeCondition(
	condition: Condition,
	t: OperatorTranslator,
): string {
	const label = t(`${OPERATOR_LABEL_PREFIX}.${condition.operator}`)
	if (!OPERATORS_WITH_VALUE.includes(condition.operator))
		return `${condition.path} ${label}`
	return `${condition.path} ${label} ${condition.value || EMPTY_VALUE_PLACEHOLDER}`
}

type Evaluator = (actual: unknown, expected: string) => boolean

const EVALUATORS: Record<ConditionOperator, Evaluator> = {
	truthy: (actual) => Boolean(actual),
	falsy: (actual) => !actual,
	eq: (actual, expected) => String(actual) === expected,
	ne: (actual, expected) => String(actual) !== expected,
	gt: (actual, expected) => Number(actual) > Number(expected),
	lt: (actual, expected) => Number(actual) < Number(expected),
}

/**
 * Evaluates a condition against a data set exactly like the backend engine
 * (`src/engine/conditions.ts`), so the editor's Data mode shows the branch a
 * real send takes.
 */
export function evaluateCondition(
	condition: Condition,
	data: Record<string, unknown>,
): boolean {
	const evaluate = EVALUATORS[condition.operator]
	return evaluate(readPath(data, condition.path), condition.value)
}
