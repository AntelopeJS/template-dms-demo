import { defineDmsFrontendBuild } from '#dms/frontend-build'

// The composables are shared by the blocks; the utils are imported by path,
// so their names never compete with the DMS's own auto-imported helpers.
export default defineDmsFrontendBuild((build) => {
  build.registerAutoImports(['app/composables'])
})
