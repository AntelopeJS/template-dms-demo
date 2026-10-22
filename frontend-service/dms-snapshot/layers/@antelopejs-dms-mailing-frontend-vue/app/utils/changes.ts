import type {
	Block,
	TemplateChange,
	TemplateChangeKind,
	TemplateContent,
} from '../types/mailing'
import { blockLabelKey } from './blocks/factory'
import { findBlock } from './blocks/tree'

/** One line of the publish review: "EN · Paragraph changed". */
export interface ChangeLine {
	key: string
	icon: string
	text: string
	/** The text customers receive today, when the change rewrote one. */
	before?: string
	/** The draft's text in its place. */
	after?: string
}

export type ChangeTranslator = (
	key: string,
	params?: Record<string, string>,
) => string

/** Contents a change can name its block from: the draft, then the live one. */
export interface ChangeSources {
	draft: TemplateContent
	published: TemplateContent | null
}

const CHANGE_KEY_PREFIX = 'dms_mailing.editor.changes'
const LOCALE_SEPARATOR = ' · '
const DETAIL_SEPARATOR = ' '

const CHANGE_ICONS: Record<TemplateChangeKind, string> = {
	locale_added: 'i-ph-plus-circle',
	locale_removed: 'i-ph-minus-circle',
	subject: 'i-ph-pencil-simple',
	preheader: 'i-ph-pencil-simple',
	block_added: 'i-ph-plus-circle',
	block_removed: 'i-ph-minus-circle',
	block_changed: 'i-ph-pencil-simple',
	blocks_reordered: 'i-ph-arrows-down-up',
	variable_added: 'i-ph-brackets-curly',
	variable_removed: 'i-ph-brackets-curly',
	variable_changed: 'i-ph-brackets-curly',
}

function blockIn(
	content: TemplateContent | null,
	change: TemplateChange,
): Block | null {
	const blocks = content?.locales[change.locale]?.blocks
	return blocks && change.blockId ? findBlock(blocks, change.blockId) : null
}

function blockOf(change: TemplateChange, sources: ChangeSources): Block | null {
	return blockIn(sources.draft, change) ?? blockIn(sources.published, change)
}

/** The fields a reader recognises a block by, in the order they are tried. */
const TEXT_FIELDS = ['text', 'label', 'alt'] as const

function textOf(block: Block | null): string | undefined {
	if (!block) return undefined
	const fields = block as unknown as Record<string, unknown>
	const field = TEXT_FIELDS.find((name) => typeof fields[name] === 'string')
	return field ? (fields[field] as string) : undefined
}

type EnvelopeKind = Extract<TemplateChangeKind, 'subject' | 'preheader'>

const ENVELOPE_KINDS: TemplateChangeKind[] = ['subject', 'preheader']

function textsOf(
	change: TemplateChange,
	sources: ChangeSources,
): Pick<ChangeLine, 'before' | 'after'> {
	if (ENVELOPE_KINDS.includes(change.kind)) {
		const field = change.kind as EnvelopeKind
		return {
			before: sources.published?.locales[change.locale]?.[field],
			after: sources.draft.locales[change.locale]?.[field],
		}
	}
	if (change.kind !== 'block_changed') return {}
	return {
		before: textOf(blockIn(sources.published, change)),
		after: textOf(blockIn(sources.draft, change)),
	}
}

/** Before / after texts worth showing: both known and actually different. */
function rewriteOf(
	change: TemplateChange,
	sources: ChangeSources,
): Pick<ChangeLine, 'before' | 'after'> {
	const { before, after } = textsOf(change, sources)
	if (before === undefined || after === undefined || before === after) return {}
	return { before, after }
}

function blockName(
	change: TemplateChange,
	sources: ChangeSources,
	t: ChangeTranslator,
): string {
	if (!change.blockType) return ''
	const label = t(blockLabelKey(change.blockType))
	const block = blockOf(change, sources)
	return block?.type === 'if'
		? `${label}${DETAIL_SEPARATOR}${block.condition.path}`
		: label
}

/** "EN · " for a change of the content; nothing for a declaration's. */
function scopeOf(change: TemplateChange): string {
	return change.locale
		? `${change.locale.toUpperCase()}${LOCALE_SEPARATOR}`
		: ''
}

/** Contents to name blocks from when only the change list is known. */
export const NO_SOURCES: ChangeSources = {
	draft: { locales: {} },
	published: null,
}

/**
 * The publish review's reading of the server's change list, one line per
 * change, prefixed with its locale (a variable declaration has none).
 */
export function describeChanges(
	changes: TemplateChange[],
	sources: ChangeSources,
	t: ChangeTranslator,
): ChangeLine[] {
	return changes.map((change, index) => {
		const sentence = t(`${CHANGE_KEY_PREFIX}.${change.kind}`, {
			block: blockName(change, sources, t),
			variable: change.variable ?? '',
		})
		const subject = change.blockId ?? change.variable ?? index
		return {
			key: `${change.locale}-${change.kind}-${subject}`,
			icon: CHANGE_ICONS[change.kind],
			text: `${scopeOf(change)}${sentence}`,
			...rewriteOf(change, sources),
		}
	})
}
