import { defineAsyncComponent, type Component } from 'vue'
import type { DmsFrontendModule } from '#dms/frontend-module'

interface VueModule {
	default: Component
}

// Every .vue file under app/components is registered globally as `Demo<Name>`.
// The backend references them by name -- `CustomComponent("demo-callout")` in
// src/components/custom.ts resolves to `DemoCallout`.
const components = import.meta.glob<VueModule>('./app/components/**/*.vue')

const frontendModule: DmsFrontendModule = {
	setup(sdk) {
		for (const [path, loader] of Object.entries(components).sort()) {
			const name = path
				.split('/')
				.at(-1)!
				.replace(/\.vue$/, '')
			sdk.registerComponent(`Demo${name}`, defineAsyncComponent(loader))
		}
	},
}

export default frontendModule
