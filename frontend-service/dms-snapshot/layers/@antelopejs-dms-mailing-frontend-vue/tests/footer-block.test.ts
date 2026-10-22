// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, provide, ref } from 'vue'
import FooterBlockView from '../app/components/blocks/Footer.vue'
import type { FooterBlock } from '../app/types/mailing'
import { TOKEN_DATA_KEY } from '../app/utils/tokens'
import type { TokenData } from '../app/utils/tokens'
import { mount, slotStub, stubNuxtGlobals } from './helpers/nuxt-globals'
import type { Mounted } from './helpers/nuxt-globals'

const TokenTextStub = defineComponent({
	props: { text: { type: String, default: '' } },
	setup: (props) => () => h('span', props.text),
})

const footer = (overrides: Partial<FooterBlock> = {}): FooterBlock => ({
	id: 'f',
	type: 'footer',
	text: 'Acme SA',
	unsubscribeLabel: 'Unsubscribe',
	preferencesLabel: 'Preferences',
	visibleIf: null,
	...overrides,
})

/** The footer on a canvas whose Data mode provides `data`. */
const onCanvas = (block: FooterBlock, data: TokenData = null) =>
	defineComponent({
		setup() {
			provide(TOKEN_DATA_KEY, ref(data))
			return () => h(FooterBlockView, { block })
		},
	})

let mounted: Mounted | null = null

const render = (block: FooterBlock, data: TokenData = null): HTMLElement => {
	mounted = mount(
		onCanvas(block, data),
		{},
		{
			MailingTokenText: TokenTextStub,
			UIcon: slotStub('UIcon'),
		},
	)
	return mounted.host
}

describe('Footer block on the canvas', () => {
	beforeEach(() => stubNuxtGlobals())
	afterEach(() => {
		mounted?.unmount()
		mounted = null
		vi.unstubAllGlobals()
	})

	it('greys the links whose URL only arrives at send time', () => {
		const host = render(footer())
		const links = [...host.querySelectorAll('span.underline')]
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			'Unsubscribe',
			'Preferences',
		])
		expect(links[0]?.className).toContain('text-gray-400')
		expect(links[0]?.getAttribute('title')).toBe(
			'dms_mailing.editor.footer.url_at_send path=unsubscribeUrl',
		)
		expect(host.textContent).toContain(
			'dms_mailing.editor.footer.url_at_send_hint',
		)
	})

	it('shows a link as sent when the test data carries its URL', () => {
		const host = render(footer({ preferencesLabel: '' }), {
			unsubscribeUrl: 'https://u.test',
		})
		const links = [...host.querySelectorAll('span.underline')]
		expect(links).toHaveLength(1)
		expect(links[0]?.className).not.toContain('text-gray-300')
		expect(host.textContent).not.toContain('url_at_send_hint')
	})

	it('says so when the footer has neither text nor link', () => {
		const host = render(
			footer({ text: '', unsubscribeLabel: '', preferencesLabel: '' }),
		)
		expect(host.textContent).toContain('dms_mailing.editor.footer.empty')
	})
})
