import { defineDmsServer } from '#dms/server'
import { testerRoute } from './server/tester'

// The API tester's call forwarding: served by this module, under its own
// namespace. The frontend server has no tester route of its own, and answers
// the path's other methods with a 405 itself.
export default defineDmsServer((server) => {
  server.registerRoute('POST', '/api/_dms-api/tester', testerRoute)
})
