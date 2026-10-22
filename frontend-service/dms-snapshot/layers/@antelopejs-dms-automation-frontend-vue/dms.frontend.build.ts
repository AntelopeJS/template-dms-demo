import { defineDmsFrontendBuild } from "#dms/frontend-build";

// The layer's public helpers, auto-imported in its own components: nothing is
// auto-imported from a module that does not list its folders here.
export default defineDmsFrontendBuild((build) => {
  build.registerAutoImports(["app/composables", "app/utils"]);
});
