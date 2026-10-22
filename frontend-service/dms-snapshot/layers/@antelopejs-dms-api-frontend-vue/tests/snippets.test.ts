import { describe, expect, it } from 'vitest'
import {
  capturedSnippetRequest,
  fillPath,
  routeSnippetRequest,
  toCurl,
  toFetch,
  withQuery,
} from '../app/utils/snippets'
import { closestMatch } from '../app/utils/search'
import {
  cachedDateFormat,
  formatClock,
  formatMs,
  prettyBody,
} from '../app/utils/format'

describe('snippets', () => {
  const request = {
    method: 'post',
    path: '/api/orders',
    origin: 'https://api.acme.test',
    headers: { 'content-type': 'application/json' },
    body: `{"note":"it's"}`,
  }

  it('writes a cURL command that survives quotes', () => {
    expect(toCurl(request)).toBe(
      [
        "curl -X POST 'https://api.acme.test/api/orders'",
        "  -H 'content-type: application/json'",
        `  -d '{"note":"it'\\''s"}'`,
      ].join(' \\\n'),
    )
  })

  it('writes a fetch call', () => {
    expect(toFetch(request)).toBe(
      [
        'await fetch("https://api.acme.test/api/orders", {',
        '  method: "POST",',
        '  headers: {',
        '    "content-type": "application/json",',
        '  },',
        `  body: JSON.stringify({"note":"it's"}),`,
        '})',
      ].join('\n'),
    )
  })

  it('says where the API and the token come from when it cannot fill them', () => {
    const curl = toCurl({
      method: 'GET',
      path: '/api/customers/:id',
      origin: null,
      session: true,
    })
    expect(curl).toContain('# API_URL: the public URL of the API')
    expect(curl).toContain('# TOKEN: a DMS access token')
    expect(curl).toContain(
      `#   TOKEN=$(curl -s -X POST "$API_URL/api/auth/login"`,
    )
    expect(curl).toContain('# ID: value of the path parameter :id')
    expect(curl).toContain(`curl -X GET "$API_URL/api/customers/$ID" \\`)
    expect(curl).toContain(`  -H "authorization: Bearer $TOKEN"`)
  })

  it('fills the path and the query of the last successful call', () => {
    const curl = toCurl(
      routeSnippetRequest(
        {
          method: 'GET',
          path: '/api/customers/:id',
          requiresAuth: false,
          contract: {
            exampleBody: null,
            examplePath: { id: 'C-00988' },
            exampleQuery: { expand: ['orders', 'notes'] },
          },
        },
        'http://127.0.0.1:5011',
        false,
      ),
    )
    expect(curl).toBe(
      "curl -X GET 'http://127.0.0.1:5011/api/customers/C-00988?expand=orders&expand=notes'",
    )
  })

  it('turns masked values into variables, never sends [REDACTED]', () => {
    const snippet = capturedSnippetRequest(
      {
        method: 'POST',
        rawPath: '/api/login',
        query: { token: '[REDACTED]', page: '2' },
        requestHeaders: {
          host: '127.0.0.1:5011',
          'content-length': '42',
          'accept-encoding': 'gzip, deflate',
          'x-api-key': '[REDACTED]',
        },
        requestBody:
          '{"email":"a@b.c","password":"[REDACTED]","payment":{"apiKey":"[REDACTED]"}}',
      },
      'http://127.0.0.1:5011',
    )
    const curl = toCurl(snippet)
    const command = curl
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n')
    expect(command).not.toMatch(/REDACTED/)
    expect(curl).toContain(
      '# TOKEN: query parameter token, masked as [REDACTED]',
    )
    expect(curl).toContain('# X_API_KEY: header x-api-key, masked')
    expect(curl).toContain('# PASSWORD: body field password, masked')
    expect(curl).toContain('# API_KEY: body field apiKey, masked')
    expect(curl).toContain(
      `curl -X POST "http://127.0.0.1:5011/api/login?token=$TOKEN&page=2" \\`,
    )
    expect(curl).toContain('  --compressed \\')
    expect(curl).not.toContain('accept-encoding')
    expect(curl).not.toContain('host:')
    expect(curl).toContain(`  -H "x-api-key: $X_API_KEY"`)
    expect(curl).toContain(
      `  -d '{"email":"a@b.c","password":"'"$PASSWORD"'","payment":{"apiKey":"'"$API_KEY"'"}}'`,
    )
    const fetch = toFetch(snippet)
    expect(fetch).toContain("const PASSWORD = '' // body field password")
    expect(fetch).toContain(
      'body: JSON.stringify({"email":"a@b.c","password":PASSWORD,"payment":{"apiKey":API_KEY}}),',
    )
    expect(fetch).toContain(
      'await fetch(`http://127.0.0.1:5011/api/login?token=${TOKEN}&page=2`, {',
    )
  })

  it('names masked form values and warns about a truncated body', () => {
    const curl = toCurl(
      capturedSnippetRequest(
        {
          method: 'POST',
          rawPath: '/login',
          requestBody: 'user=ann&password=%5BREDACTED%5D',
          requestBodyTruncated: true,
        },
        'http://api.test',
      ),
    )
    expect(curl).toContain('# PASSWORD: body value, masked')
    expect(curl).toContain('# Warning: the body was truncated when captured')
    expect(curl).toContain(`  -d "user=ann&password=$PASSWORD"`)
  })

  it('says the body was not captured instead of sending none silently', () => {
    const omitted = (method: string, reason: string | null) =>
      toCurl(
        capturedSnippetRequest(
          {
            method,
            rawPath: '/api/orders',
            requestHeaders: { 'content-type': 'application/json' },
            requestBodyOmitted: reason,
          },
          'http://api.test',
        ),
      )
    const curl = omitted('POST', 'malformed')
    expect(curl).toContain(
      '# Warning: the body was not captured (its JSON was invalid): add it before running',
    )
    expect(curl).not.toContain(' -d ')
    expect(omitted('POST', 'not-json')).toContain(
      '(only JSON bodies are captured)',
    )
    // Sent empty, or a method that sends none: nothing is missing.
    expect(omitted('POST', 'empty')).not.toContain('Warning')
    expect(omitted('GET', 'not-read')).not.toContain('Warning')
    expect(
      toFetch(
        capturedSnippetRequest(
          { method: 'PUT', rawPath: '/a', requestBodyOmitted: 'too-large' },
          'http://api.test',
        ),
      ),
    ).toContain(
      '// Warning: the body was not captured (it was larger than the maximum body size)',
    )
  })

  it('turns a card number masked in a text into a variable of its own', () => {
    const snippet = capturedSnippetRequest(
      {
        method: 'POST',
        rawPath: '/api/orders',
        requestBody:
          '{"note":"paid with [REDACTED] thanks","cardNumber":"[REDACTED]"}',
      },
      'http://api.test',
    )
    const curl = toCurl(snippet)
    expect(curl).toContain(
      '# CARD_NUMBER: a card number in the text of body field note, masked as [REDACTED]',
    )
    expect(curl).toContain('# CARD_NUMBER_2: body field cardNumber, masked')
    expect(curl).toContain(
      `  -d '{"note":"paid with '"$CARD_NUMBER"' thanks","cardNumber":"'"$CARD_NUMBER_2"'"}'`,
    )
    expect(toFetch(snippet)).toContain(
      'body: `{"note":"paid with ${CARD_NUMBER} thanks","cardNumber":"${CARD_NUMBER_2}"}`,',
    )
  })

  it('makes up no body for a route whose calls showed none', () => {
    const curl = toCurl(
      routeSnippetRequest(
        {
          method: 'DELETE',
          path: '/api/orders/:id',
          requiresAuth: false,
          contract: { exampleBody: null, examplePath: { id: '10431' } },
        },
        'http://127.0.0.1:5011',
        true,
      ),
    )
    expect(curl).toBe("curl -X DELETE 'http://127.0.0.1:5011/api/orders/10431'")
    const seen = toCurl(
      routeSnippetRequest(
        {
          method: 'POST',
          path: '/api/orders',
          requiresAuth: false,
          contract: { exampleBody: { customerId: 'C-1' } },
        },
        'http://127.0.0.1:5011',
        true,
      ),
    )
    expect(seen).toContain("  -H 'content-type: application/json'")
    expect(seen).toContain(`  -d '{"customerId":"C-1"}'`)
  })

  it('fills path params and leaves the empty ones visible', () => {
    expect(fillPath('/api/orders/:id/lines/:line', { id: 'A 1' })).toBe(
      '/api/orders/A%201/lines/:line',
    )
    expect(withQuery('/api/orders', { page: '2', empty: '' })).toBe(
      '/api/orders?page=2',
    )
  })
})

describe('closestMatch', () => {
  it('finds the route a typo meant', () => {
    expect(
      closestMatch('refnd', ['/api/orders/:id/refund', '/api/customers']),
    ).toBe('/api/orders/:id/refund')
    expect(closestMatch('zzzzzz', ['/api/orders'])).toBeNull()
  })
})

describe('format', () => {
  it('writes durations and times of requests', () => {
    expect(formatMs(48, 'en')).toBe('48 ms')
    expect(formatMs(12_400, 'en')).toBe('12.4 s')
    const now = new Date('2026-10-07T14:31:58.412')
    const en = cachedDateFormat(
      (options) => new Intl.DateTimeFormat('en-GB', options),
    )
    expect(formatClock(now, en, true, now)).toBe('14:31:58.412')
    expect(formatClock(new Date('2026-09-28T14:31:58'), en, false, now)).toBe(
      '28 Sept, 14:31:58',
    )
  })

  it('pretty-prints JSON bodies only', () => {
    expect(prettyBody('{"a":1}')).toEqual({
      text: '{\n  "a": 1\n}',
      json: true,
    })
    expect(prettyBody('plain')).toEqual({ text: 'plain', json: false })
  })
})
