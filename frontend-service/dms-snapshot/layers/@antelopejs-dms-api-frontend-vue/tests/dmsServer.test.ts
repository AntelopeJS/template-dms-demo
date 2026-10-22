import { describe, expect, it, vi } from 'vitest'
import { testerRoute } from '../server/tester'

// The frontend server (dms-frontend 0.6) serves no tester route of its own:
// the module's `dms.server.ts` is the only one to declare it.

vi.mock('#dms/server', () => ({
  defineDmsServer: (setup: unknown) => setup,
}))

interface Registration {
  method: unknown
  path: string
  handler: unknown
  options: unknown
}

async function registrations(): Promise<Registration[]> {
  const { default: setup } = await import('../dms.server')
  const routes: Registration[] = []
  const server = {
    registerRoute: (
      method: unknown,
      path: string,
      handler: unknown,
      options?: unknown,
    ) => routes.push({ method, path, handler, options }),
  }
  ;(setup as unknown as (server: unknown) => void)(server)
  return routes
}

describe('dms.server.ts', () => {
  it("serves the tester's POST under the module's own namespace, and nothing else", async () => {
    expect(await registrations()).toEqual([
      {
        method: 'POST',
        path: '/api/_dms-api/tester',
        handler: testerRoute,
        options: undefined,
      },
    ])
  })
})
