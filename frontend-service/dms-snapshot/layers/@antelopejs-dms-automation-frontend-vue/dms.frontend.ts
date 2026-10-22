import { defineAsyncComponent, type Component } from "vue";
import type { DmsFrontendModule } from "#dms/frontend-module";
import cellDisplaysPlugin from "./app/plugins/cell-displays";

interface VueModule {
  default: Component;
}

const components = import.meta.glob<VueModule>("./app/components/**/*.vue");

const frontendModule: DmsFrontendModule = {
  // Put in front of every registered name: Editor.vue registers as
  // DmsAutomationEditor, which the backend names `dms-automation-editor`.
  componentPrefix: "DmsAutomation",
  setup(sdk) {
    Object.entries(components)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([path, loader]) => {
        const name = path
          .split("/")
          .at(-1)!
          .replace(/\.vue$/, "");
        sdk.registerComponent(name, defineAsyncComponent(loader));
      });
    sdk.registerPlugin(cellDisplaysPlugin);
  },
};

export default frontendModule;
