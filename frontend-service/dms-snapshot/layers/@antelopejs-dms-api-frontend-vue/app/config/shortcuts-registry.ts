import type { ComponentShortcuts } from '#dms-ui/app/types/shortcuts'

// The console's own page keys, listed on the DMS Shortcuts page. The request
// logs' search ("/"), J / K, Esc and L are the DMS table's and live
// toggle's, which list themselves.
const ROUTES = '$api.routes.shortcuts.group'
const LOGS = '$api.logs.shortcuts.group'

export default [
  {
    component: ROUTES,
    shortcuts: [
      {
        key: ['/'],
        descriptionKey: '$api.routes.shortcuts.filter',
        component: ROUTES,
      },
    ],
  },
  {
    component: LOGS,
    shortcuts: [
      {
        key: ['?'],
        descriptionKey: '$api.logs.shortcuts.help',
        component: LOGS,
      },
    ],
  },
] satisfies ComponentShortcuts[]
