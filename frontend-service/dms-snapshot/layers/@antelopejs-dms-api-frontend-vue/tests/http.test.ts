import { describe, expect, it } from 'vitest'
import {
  acceptsRequestBody,
  isWritingMethod,
  methodTone,
  parseRouteRef,
  pathSegments,
  startsWithRequestBody,
  statusClassOf,
  statusText,
  statusTone,
} from '../app/utils/http'

describe('http', () => {
  it('gives every method one tone', () => {
    expect(methodTone('get')).toBe('info')
    expect(methodTone('POST')).toBe('success')
    expect(methodTone('PATCH')).toBe('warning')
    expect(methodTone('DELETE')).toBe('error')
    expect(methodTone('OPTIONS')).toBe('neutral')
  })

  it('tints a status by its class', () => {
    expect(statusClassOf(201)).toBe('2xx')
    expect(statusTone(304)).toBe('info')
    expect(statusTone('422')).toBe('warning')
    expect(statusTone(500)).toBe('error')
    expect(statusTone(0)).toBe('neutral')
    expect(statusText(201)).toBe('Created')
  })

  it('knows which calls change data', () => {
    expect(isWritingMethod('get')).toBe(false)
    expect(isWritingMethod('delete')).toBe(true)
  })

  it('knows which calls carry a body, and which start with one', () => {
    expect(acceptsRequestBody('get')).toBe(false)
    expect(acceptsRequestBody('HEAD')).toBe(false)
    expect(acceptsRequestBody('DELETE')).toBe(true)
    expect(startsWithRequestBody('post')).toBe(true)
    expect(startsWithRequestBody('DELETE')).toBe(false)
    expect(startsWithRequestBody('GET')).toBe(false)
  })

  it('splits a path on its params', () => {
    expect(pathSegments('/api/orders/:id/refund')).toEqual([
      { text: '/api/orders/', param: false },
      { text: ':id', param: true },
      { text: '/refund', param: false },
    ])
  })

  it('reads a route reference', () => {
    expect(parseRouteRef('patch /api/orders/:id')).toEqual({
      method: 'PATCH',
      path: '/api/orders/:id',
    })
    expect(parseRouteRef('nope')).toBeNull()
  })
})
