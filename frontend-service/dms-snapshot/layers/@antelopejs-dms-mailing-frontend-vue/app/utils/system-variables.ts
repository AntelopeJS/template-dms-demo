import type {
	Block,
	FooterBlock,
	LocaleContent,
	TemplateContent,
	VariableDefinition,
} from '../types/mailing'
import type { EditorCheck } from './editor-checks'
import {
	PREFERENCES_URL_PATH,
	SYSTEM_PATHS,
	UNSUBSCRIBE_URL_PATH,
	pathsInBlocks,
	textPaths,
} from './paths'

/** The category whose e-mails are campaigns; the settings never remove it. */
export const MARKETING_CATEGORY = 'marketing'

type FooterLabelKey = 'unsubscribeLabel' | 'preferencesLabel'

/**
 * Each footer link: the label that shows it and the URL the caller passes.
 * The footer links are the system variables of a template's contract, as in
 * the server's `src/engine/system-variables.ts`, which the layer cannot
 * import: a link shows when its label is filled.
 */
export const FOOTER_LINK_PATHS: Record<FooterLabelKey, string> = {
	unsubscribeLabel: UNSUBSCRIBE_URL_PATH,
	preferencesLabel: PREFERENCES_URL_PATH,
}

const LABEL_KEYS = Object.keys(FOOTER_LINK_PATHS) as FooterLabelKey[]
const SYSTEM_VARIABLE_TYPE = 'url'
const CHECK_KEY_PREFIX = 'dms_mailing.editor.checks'

/** A system variable: declared by the content itself, never by hand. */
export interface SystemVariable extends VariableDefinition {
	system: true
}

export function isMarketingCategory(category?: string | null): boolean {
	return category === MARKETING_CATEGORY
}

/**
 * Whether a new footer of this category carries the unsubscribe and
 * preferences links: a transactional e-mail is not subscribed to, so only an
 * uncategorised or marketing one does.
 */
export function hasFooterLinksByDefault(category?: string | null): boolean {
	return !category || isMarketingCategory(category)
}

const isFooter = (block: Block): block is FooterBlock => block.type === 'footer'

/** The URL paths a footer shows a link for: the ones with a label. */
export function footerLinkPaths(block: FooterBlock): string[] {
	return LABEL_KEYS.filter((key) => block[key].trim()).map(
		(key) => FOOTER_LINK_PATHS[key],
	)
}

function footersIn(blocks: Block[]): FooterBlock[] {
	return blocks.flatMap((block) => {
		if (isFooter(block)) return [block]
		if (block.type !== 'if') return []
		return footersIn([...block.children, ...(block.elseChildren ?? [])])
	})
}

function localeSystemPaths(locale: LocaleContent): string[] {
	const linked = footersIn(locale.blocks).flatMap(footerLinkPaths)
	const referenced = [
		...textPaths(locale.subject),
		...textPaths(locale.preheader),
		...pathsInBlocks(locale.blocks),
	]
	return [...linked, ...referenced]
}

/** The system paths any locale of the content uses, in a stable order. */
export function contentSystemPaths(
	content: Pick<TemplateContent, 'locales'>,
): string[] {
	const used = new Set(
		Object.values(content.locales ?? {}).flatMap(localeSystemPaths),
	)
	return SYSTEM_PATHS.filter((path) => used.has(path))
}

/**
 * The URLs a template's caller passes for the links its content shows, as
 * declarations: type url, required when the template is marketing.
 */
export function systemVariables(
	content: Pick<TemplateContent, 'locales'>,
	category?: string | null,
): SystemVariable[] {
	const required = isMarketingCategory(category)
	return contentSystemPaths(content).map((path) => ({
		path,
		type: SYSTEM_VARIABLE_TYPE,
		required,
		system: true,
	}))
}

const hasUnsubscribeLink = (locale: LocaleContent): boolean =>
	localeSystemPaths(locale).includes(UNSUBSCRIBE_URL_PATH)

const check = (
	id: string,
	key: string,
	params: Record<string, string | number>,
): EditorCheck => ({
	id,
	state: 'warn',
	key: `${CHECK_KEY_PREFIX}.${key}`,
	params,
})

function unlinkedMarketingLocales(
	content: Pick<TemplateContent, 'locales'>,
	category?: string | null,
): EditorCheck[] {
	if (!isMarketingCategory(category)) return []
	return Object.entries(content.locales ?? {})
		.filter(([, locale]) => !hasUnsubscribeLink(locale))
		.map(([code]) =>
			check(`unsubscribe-${code}`, 'marketing_no_unsubscribe', {
				locale: code.toUpperCase(),
			}),
		)
}

/**
 * What the publish review warns about the footer links: a marketing locale
 * without an unsubscribe link, and a required system URL the test data does
 * not carry — a send without it is refused or goes out without the link.
 */
export function systemVariableChecks(
	content: Pick<TemplateContent, 'locales'>,
	category: string | null | undefined,
	data: Record<string, unknown>,
): EditorCheck[] {
	const missing = systemVariables(content, category)
		.filter((variable) => variable.required)
		.filter((variable) => !hasSystemUrl(data, variable.path))
		.map((variable) =>
			check(`system-${variable.path}`, 'system_url_missing', {
				path: variable.path,
			}),
		)
	return [...unlinkedMarketingLocales(content, category), ...missing]
}

/** Whether the data a canvas previews carries a usable URL for `path`. */
export function hasSystemUrl(
	data: Record<string, unknown> | null | undefined,
	path: string,
): boolean {
	const value = data?.[path]
	return typeof value === 'string' && value.trim() !== ''
}
