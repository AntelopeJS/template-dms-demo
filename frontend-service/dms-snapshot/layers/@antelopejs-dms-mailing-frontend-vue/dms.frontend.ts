import { defineAsyncComponent, type Component } from 'vue'
import type { DmsFrontendModule } from '#dms/frontend-module'
import columnDisplays from './app/plugins/column-displays'
import templateGallery from './app/plugins/template-gallery-display'

interface VueModule {
	default: Component
}

const COMPONENT_PREFIX = 'Mailing'
const BLOCKS_DIRECTORY = '/components/blocks/'
const BLOCK_NAME_PREFIX = 'Block'

const components = import.meta.glob<VueModule>('./app/components/**/*.vue')

function componentName(path: string): string {
	const base = path
		.split('/')
		.at(-1)!
		.replace(/\.vue$/, '')
	return path.includes(BLOCKS_DIRECTORY) ? `${BLOCK_NAME_PREFIX}${base}` : base
}

const frontendModule: DmsFrontendModule = {
	componentPrefix: COMPONENT_PREFIX,
	setup(sdk) {
		Object.entries(components)
			.sort(([left], [right]) => left.localeCompare(right))
			.forEach(([path, loader]) => {
				sdk.registerComponent(componentName(path), defineAsyncComponent(loader))
			})
		sdk.registerPlugin(templateGallery)
		sdk.registerPlugin(columnDisplays)
	},
}

export default frontendModule
