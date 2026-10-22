import { VARIABLE_TYPES, type VariableType } from '../types/mailing'

const VARIABLE_TYPE_KEY_PREFIX = 'dms_mailing.variable_types'

export interface VariableTypeItem {
	value: VariableType
	label: string
}

/** The i18n key naming a variable type for a writer ("Amount" for `money`). */
export function variableTypeLabelKey(type: VariableType): string {
	return `${VARIABLE_TYPE_KEY_PREFIX}.${type}`
}

/** The type picker's items: the stored value, the label a writer reads. */
export function variableTypeItems(
	translate: (key: string) => string,
): VariableTypeItem[] {
	return VARIABLE_TYPES.map((type) => ({
		value: type,
		label: translate(variableTypeLabelKey(type)),
	}))
}
