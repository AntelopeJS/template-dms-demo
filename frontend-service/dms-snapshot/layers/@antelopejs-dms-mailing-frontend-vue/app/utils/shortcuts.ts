export type EditorShortcut =
	| 'save'
	| 'publish'
	| 'test'
	| 'search'
	| 'delete'
	| 'duplicate'
	| 'escape'
	| 'undo'
	| 'redo'

/** The parts of a `KeyboardEvent` a shortcut is matched on. */
export interface KeyStroke {
	key: string
	metaKey: boolean
	ctrlKey: boolean
	shiftKey: boolean
	altKey: boolean
}

interface ShortcutRule {
	shortcut: EditorShortcut
	keys: string[]
	hasModifier: boolean
	hasShift?: boolean
	isAllowedWhileTyping: boolean
}

const rule = (
	shortcut: EditorShortcut,
	keys: string[],
	hasModifier: boolean,
	isAllowedWhileTyping: boolean,
	hasShift?: boolean,
): ShortcutRule => ({
	shortcut,
	keys,
	hasModifier,
	isAllowedWhileTyping,
	hasShift,
})

const RULES: ShortcutRule[] = [
	rule('save', ['s'], true, true),
	rule('publish', ['enter'], true, true),
	rule('duplicate', ['d'], true, false),
	rule('redo', ['z'], true, false, true),
	rule('redo', ['y'], true, false),
	rule('undo', ['z'], true, false, false),
	rule('test', ['t'], false, false),
	rule('search', ['/'], false, false),
	rule('delete', ['backspace', 'delete'], false, false),
	rule('escape', ['escape'], false, false),
]

const NON_TEXT_INPUT_TYPES = [
	'button',
	'checkbox',
	'radio',
	'range',
	'reset',
	'submit',
	'color',
	'file',
]
const TEXT_TAGS = ['TEXTAREA', 'SELECT']
const INPUT_TAG = 'INPUT'
const EDITABLE_SELECTOR = '[contenteditable=""], [contenteditable="true"]'

interface TargetLike {
	tagName?: string
	type?: string
	isContentEditable?: boolean
	closest?: (selector: string) => unknown
}

/**
 * Whether the keystroke lands in something the user types in: single-key
 * shortcuts (T, /, ⌫) must leave those alone.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
	const element = target as TargetLike | null
	if (!element?.tagName) return false
	if (TEXT_TAGS.includes(element.tagName)) return true
	if (element.tagName === INPUT_TAG)
		return !NON_TEXT_INPUT_TYPES.includes(element.type ?? '')
	if (element.isContentEditable) return true
	return Boolean(element.closest?.(EDITABLE_SELECTOR))
}

function matches(stroke: KeyStroke, candidate: ShortcutRule): boolean {
	const hasModifier = stroke.metaKey || stroke.ctrlKey
	if (stroke.altKey || hasModifier !== candidate.hasModifier) return false
	if (
		candidate.hasShift !== undefined &&
		candidate.hasShift !== stroke.shiftKey
	)
		return false
	return candidate.keys.includes(stroke.key.toLowerCase())
}

/** The editor shortcut a keystroke triggers, or `null`. */
export function matchShortcut(
	stroke: KeyStroke,
	isTyping: boolean,
): EditorShortcut | null {
	const found = RULES.find(
		(candidate) =>
			matches(stroke, candidate) &&
			(!isTyping || candidate.isAllowedWhileTyping),
	)
	return found?.shortcut ?? null
}
