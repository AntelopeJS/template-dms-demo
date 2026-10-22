import { defineAsyncComponent, type Component } from "vue";
import type { DmsFrontendModule } from "#dms/frontend-module";
import aiPlugin from "./app/plugins/ai.client";
import sidePanelPlugin from "./app/plugins/side-panel";

interface VueModule {
	default: Component;
}

const VUE_EXTENSION = /\.vue$/;

// Every component is addressed by name from the backend, so registering the
// whole directory keeps the two sides in sync without a manual list.
const components = import.meta.glob<VueModule>("./app/components/**/*.vue");

function componentName(path: string): string {
	return (path.split("/").at(-1) ?? path).replace(VUE_EXTENSION, "");
}

const frontendModule: DmsFrontendModule = {
	// Put in front of every name registered below: StatusCard.vue registers as
	// DmsAiStatusCard, the name the backend's CustomComponent() sends.
	componentPrefix: "DmsAi",
	setup(sdk) {
		Object.entries(components)
			.sort(([left], [right]) => left.localeCompare(right))
			.forEach(([path, loader]) => {
				sdk.registerComponent(
					componentName(path),
					defineAsyncComponent(async () => (await loader()).default),
				);
			});
		sdk.registerPlugin(sidePanelPlugin);
		sdk.registerPlugin(aiPlugin, { clientOnly: true });
	},
};

export default frontendModule;
