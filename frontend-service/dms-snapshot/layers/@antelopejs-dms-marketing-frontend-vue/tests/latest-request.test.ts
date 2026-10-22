import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { useLatestRequest } from '../app/composables/useLatestRequest'

describe('useLatestRequest loading states', () => {
  it('is unsettled immediately and settles with the fetched path inventory', async () => {
    let resolve: ((value: { pages: { path: string }[] }) => void) | undefined
    const request = useLatestRequest(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )

    const pending = request.run()
    expect(request.settled.value).toBe(false)
    expect(request.loading.value).toBe(true)
    expect(request.data.value).toBeNull()

    resolve?.({ pages: [{ path: '/pricing' }] })
    await pending
    await nextTick()

    expect(request.settled.value).toBe(true)
    expect(request.loading.value).toBe(false)
    expect(request.data.value?.pages[0]?.path).toBe('/pricing')
  })

  it('settles an empty response without leaving the empty path state loading', async () => {
    const request = useLatestRequest(async () => ({ pages: [] }))

    await request.run()

    expect(request.settled.value).toBe(true)
    expect(request.loading.value).toBe(false)
    expect(request.data.value?.pages).toEqual([])
  })
})
