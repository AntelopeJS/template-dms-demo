import type {
	Block,
	BlockType,
	VariableDefinition,
	VariableType,
} from '../../types/mailing'
import { hasFooterLinksByDefault } from '../system-variables'

export interface PaletteEntry {
	type: BlockType
	icon: string
	/** The tile spans both columns of the palette grid. */
	isWide?: boolean
}

/** The icon that stands for each block type, in the palette and the outline. */
export const BLOCK_ICONS: Record<BlockType, string> = {
	heading: 'i-ph-text-h',
	paragraph: 'i-ph-text-align-left',
	hero: 'i-ph-image',
	button: 'i-ph-cursor-click',
	list: 'i-ph-list-bullets',
	total: 'i-ph-receipt',
	code: 'i-ph-hash',
	divider: 'i-ph-minus',
	footer: 'i-ph-rows',
	if: 'i-ph-git-branch',
}

const entry = (type: BlockType, isWide = false): PaletteEntry => ({
	type,
	icon: BLOCK_ICONS[type],
	isWide,
})

export const BLOCK_PALETTE: PaletteEntry[] = [
	entry('heading'),
	entry('paragraph'),
	entry('hero'),
	entry('button'),
	entry('list'),
	entry('total'),
	entry('code'),
	entry('divider'),
	entry('footer', true),
]

export const LOGIC_PALETTE: PaletteEntry[] = [entry('if', true)]

const BLOCK_LABEL_PREFIX = 'dms_mailing.blocks'
const PALETTE_LABEL_PREFIX = 'dms_mailing.editor.palette.tiles'
const PALETTE_SPECIFIC_LABELS: BlockType[] = ['footer', 'if']

/** The i18n key naming a block type (outline, inspector, canvas tag). */
export function blockLabelKey(type: BlockType): string {
	return `${BLOCK_LABEL_PREFIX}.${type}`
}

/** The i18n key of a palette tile, longer than the block name for some. */
export function paletteLabelKey(type: BlockType): string {
	return PALETTE_SPECIFIC_LABELS.includes(type)
		? `${PALETTE_LABEL_PREFIX}.${type}`
		: blockLabelKey(type)
}

/** Keeps the tiles whose label or type contains `query`, case-insensitively. */
export function filterPalette(
	entries: PaletteEntry[],
	query: string,
	labelOf: (entry: PaletteEntry) => string,
): PaletteEntry[] {
	const needle = query.trim().toLowerCase()
	if (!needle) return entries
	return entries.filter(
		(candidate) =>
			labelOf(candidate).toLowerCase().includes(needle) ||
			candidate.type.includes(needle),
	)
}

const ID_RADIX = 36
const ID_LENGTH = 6
const ID_PADDING = '0'
const DEFAULT_HEADING_SIZE = 23

export function newBlockId(type: BlockType): string {
	const random = Math.random()
		.toString(ID_RADIX)
		.slice(2, 2 + ID_LENGTH)
	return `${type}_${random.padEnd(ID_LENGTH, ID_PADDING)}`
}

/**
 * What a new block may borrow from the template it lands in: the locale its
 * labels are written in, and the variables a list or a condition can point at.
 */
export interface BlockContext {
	locale?: string
	variables?: VariableDefinition[]
	detected?: string[]
	/** The template's category: a transactional footer has no links. */
	category?: string | null
}

export interface FooterLabels {
	unsubscribe: string
	preferences: string
}

/**
 * The words a new block starts with. They land in the e-mail itself, so they
 * follow the language of the locale being edited, not the interface's.
 */
export interface BlockPlaceholders extends FooterLabels {
	heading: string
	paragraph: string
	button: string
	total: string
}

/** The footer labels mirror the backend's `blankContent` footer. */
const BLOCK_PLACEHOLDERS: Record<string, BlockPlaceholders> = {
	en: {
		heading: 'New heading',
		paragraph: 'Paragraph text…',
		button: 'Button',
		total: 'Total',
		unsubscribe: 'Unsubscribe',
		preferences: 'Preferences',
	},
	fr: {
		heading: 'Nouveau titre',
		paragraph: 'Votre texte…',
		button: 'Bouton',
		total: 'Total',
		unsubscribe: 'Se désinscrire',
		preferences: 'Préférences',
	},
}
/** A footer without unsubscribe and preferences links. */
const NO_FOOTER_LINKS: FooterLabels = { unsubscribe: '', preferences: '' }
const DEFAULT_PLACEHOLDER_LANGUAGE = 'en'
const LANGUAGE_SEPARATOR = /[-_]/

/** The starting words of a locale (`fr`, `fr-BE`…), English otherwise. */
export function placeholdersFor(locale?: string): BlockPlaceholders {
	const language = (locale ?? '').split(LANGUAGE_SEPARATOR)[0] ?? ''
	return (BLOCK_PLACEHOLDERS[language] ??
		BLOCK_PLACEHOLDERS[DEFAULT_PLACEHOLDER_LANGUAGE]) as BlockPlaceholders
}

/** The default footer labels of a locale (`fr`, `fr-BE`…), English otherwise. */
export function footerLabelsFor(locale?: string): FooterLabels {
	const { unsubscribe, preferences } = placeholdersFor(locale)
	return { unsubscribe, preferences }
}

/** Paths a block points at when the template has no fitting variable yet. */
const PLACEHOLDER_LIST_SOURCE = 'items'
const PLACEHOLDER_CONDITION_PATH = 'condition'
const LIST_TYPE: VariableType = 'array'
const CONDITION_TYPE: VariableType = 'boolean'

function declaredOfType(
	context: BlockContext,
	type: VariableType,
): string | undefined {
	return context.variables?.find((variable) => variable.type === type)?.path
}

function listSource(context: BlockContext): string {
	return declaredOfType(context, LIST_TYPE) ?? PLACEHOLDER_LIST_SOURCE
}

function conditionPath(context: BlockContext): string {
	return (
		declaredOfType(context, CONDITION_TYPE) ??
		context.variables?.[0]?.path ??
		context.detected?.[0] ??
		PLACEHOLDER_CONDITION_PATH
	)
}

type BlockBuilder = (id: string, context: BlockContext) => Block

const BUILDERS: Record<BlockType, BlockBuilder> = {
	hero: (id) => ({ id, type: 'hero', imageUrl: '', alt: '', visibleIf: null }),
	heading: (id, context) => ({
		id,
		type: 'heading',
		text: placeholdersFor(context.locale).heading,
		align: 'left',
		size: DEFAULT_HEADING_SIZE,
		visibleIf: null,
	}),
	paragraph: (id, context) => ({
		id,
		type: 'paragraph',
		text: placeholdersFor(context.locale).paragraph,
		align: 'left',
		visibleIf: null,
	}),
	code: (id) => ({ id, type: 'code', text: '', visibleIf: null }),
	list: (id, context) => ({
		id,
		type: 'list',
		source: listSource(context),
		labelPath: 'label',
		valuePath: 'total',
		visibleIf: null,
	}),
	total: (id, context) => ({
		id,
		type: 'total',
		label: placeholdersFor(context.locale).total,
		value: '',
		visibleIf: null,
	}),
	button: (id, context) => ({
		id,
		type: 'button',
		text: placeholdersFor(context.locale).button,
		href: 'https://',
		align: 'left',
		visibleIf: null,
	}),
	if: (id, context) => ({
		id,
		type: 'if',
		condition: { path: conditionPath(context), operator: 'truthy', value: '' },
		children: [],
		elseChildren: null,
		visibleIf: null,
	}),
	divider: (id) => ({ id, type: 'divider', visibleIf: null }),
	footer: (id, context) => {
		const labels = hasFooterLinksByDefault(context.category)
			? footerLabelsFor(context.locale)
			: NO_FOOTER_LINKS
		return {
			id,
			type: 'footer',
			text: '',
			unsubscribeLabel: labels.unsubscribe,
			preferencesLabel: labels.preferences,
			visibleIf: null,
		}
	},
}

/**
 * A new block of `type`. Its content stays neutral: no invented `{{token}}`;
 * a list or a condition points at a declared variable of the right type when
 * the template has one, the starting words speak the locale's language.
 */
export function createBlock(
	type: BlockType,
	context: BlockContext = {},
): Block {
	return BUILDERS[type](newBlockId(type), context)
}
