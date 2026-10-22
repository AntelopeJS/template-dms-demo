import type { BlockType } from '../../types/mailing'

export const BLOCK_COMPONENT_NAMES: Record<BlockType, string> = {
	hero: 'MailingBlockHero',
	heading: 'MailingBlockHeading',
	paragraph: 'MailingBlockParagraph',
	code: 'MailingBlockCode',
	list: 'MailingBlockList',
	total: 'MailingBlockTotal',
	button: 'MailingBlockButton',
	if: 'MailingEditorIfBlock',
	divider: 'MailingBlockDivider',
	footer: 'MailingBlockFooter',
}
