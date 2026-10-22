/**
 * The cURL and fetch snippets the console hands out: the Documentation, the
 * request panel and the Tester all write them here, against the API origin
 * `useApiOrigin` gives. What the console cannot fill becomes a shell
 * variable (`$TOKEN`, `$PASSWORD`, `$ID`…) explained by a comment above the
 * command, never a value that would silently fail: a `[REDACTED]` sent as is,
 * a literal `:id`, the frontend's own address.
 */

/** The value capture puts in place of a secret. */
export const REDACTED = '[REDACTED]'

/** A request the docs, the panel and the tester turn into a snippet. */
export interface SnippetRequest {
  method: string
  /** A route pattern (`/api/orders/:id`) or a captured path, encoded. */
  path: string
  /** Where the API answers (`useApiOrigin`); null writes `$API_URL`. */
  origin: string | null
  /** Values of the `:name` segments of `path`; a missing one becomes `$NAME`. */
  pathParams?: Record<string, string>
  query?: Record<string, string | string[]>
  headers?: Record<string, string>
  body?: string
  /** The body was cut when captured: it is not the request that was sent. */
  bodyTruncated?: boolean
  /** Why the captured body was not stored (`requestBodyOmitted`). */
  bodyOmitted?: string | null
  /** Sends a DMS access token: `authorization: Bearer $TOKEN`. */
  session?: boolean
}

/** A request as the logs captured it. */
export interface CapturedRequest {
  method: string
  rawPath: string
  query?: Record<string, string | string[]>
  requestHeaders?: Record<string, string>
  requestBody?: string
  requestBodyTruncated?: boolean
  requestBodyOmitted?: string | null
}

/** A route as the Routes page knows it, with what its traffic showed. */
export interface DocumentedRoute {
  method: string
  path: string
  requiresAuth: boolean
  contract: {
    exampleBody: unknown
    examplePath?: Record<string, string>
    exampleQuery?: Record<string, string | string[]>
  }
}

/** Headers a replayed request must not carry: the client sets them. */
const DROPPED_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'accept-encoding',
  // A call of its own: not the Tester's, not the captured call again.
  'x-antelopejs-api-source',
  'x-request-id',
])
const REDACTED_TEXT = /\[REDACTED\]|%5BREDACTED%5D/gi
const COMPRESSED = /\b(?:gzip|deflate|br)\b/i
const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD'])
const PATH_PARAM = /^:[A-Za-z_]\w*$/

const API_URL = 'API_URL'
const TOKEN = 'TOKEN'
/** Where the DMS signs a user in and hands out an access token. */
const LOGIN_PATH = '/api/auth/login'

/** Literal text, or a variable the reader fills. */
type Part = string | { variable: string }

interface Variable {
  name: string
  note: string
  /** A command that sets it, for the cURL comment. */
  command?: string
}

type Body = { kind: 'json'; parts: Part[] } | { kind: 'text'; parts: Part[] }

interface Prepared {
  method: string
  url: Part[]
  headers: Array<[string, Part[]]>
  body?: Body
  compressed: boolean
  variables: Variable[]
  /** What the reader must know before running it: a body cut or missing. */
  warnings: string[]
}

/** `apiKey`, `x-api-key` → `API_KEY`, `X_API_KEY`. */
function variableName(raw: string): string {
  const name = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  if (!name) return 'VALUE'
  return /^\d/.test(name) ? `_${name}` : name
}

class Variables {
  readonly list: Variable[] = []
  private readonly taken = new Set<string>()

  constructor(reserved: string[]) {
    for (const name of reserved) this.taken.add(name)
  }

  /** A fresh variable named after `raw`, explained by `note`. */
  add(raw: string, note: string): Part {
    const base = variableName(raw)
    let name = base
    for (let index = 2; this.taken.has(name); index++) name = `${base}_${index}`
    this.taken.add(name)
    this.list.push({ name, note })
    return { variable: name }
  }
}

function redactedNote(where: string): string {
  return `${where}, masked as ${REDACTED} when the request was captured`
}

/** `text` with each masked value turned into a variable named after `name`. */
function unmask(
  text: string,
  name: (before: string) => string,
  where: string,
  variables: Variables,
): Part[] {
  const parts: Part[] = []
  let from = 0
  for (const match of text.matchAll(REDACTED_TEXT)) {
    const at = match.index ?? 0
    parts.push(text.slice(from, at))
    parts.push(variables.add(name(text.slice(0, at)), redactedNote(where)))
    from = at + match[0].length
  }
  parts.push(text.slice(from))
  return parts.filter((part) => part !== '')
}

function encodeParts(parts: Part[]): Part[] {
  return parts.map((part) =>
    typeof part === 'string' ? encodeURIComponent(part) : part,
  )
}

function urlOf(request: SnippetRequest, variables: Variables): Part[] {
  const url: Part[] = [request.origin || { variable: API_URL }]
  request.path.split('/').forEach((segment, index) => {
    if (index > 0) url.push('/')
    if (!PATH_PARAM.test(segment)) {
      url.push(segment)
      return
    }
    const name = segment.slice(1)
    const value = request.pathParams?.[name]
    url.push(
      value
        ? encodeURIComponent(value)
        : variables.add(name, `value of the path parameter :${name}`),
    )
  })
  const pairs = Object.entries(request.query ?? {}).flatMap(([key, value]) =>
    (Array.isArray(value) ? value : [value]).map((item) => [key, item]),
  )
  pairs
    .filter(([key]) => key)
    .forEach(([key, value], index) => {
      url.push(index === 0 ? '?' : '&', `${encodeURIComponent(key)}=`)
      url.push(
        ...encodeParts(
          unmask(value, () => key, `query parameter ${key}`, variables),
        ),
      )
    })
  return url
}

function headersOf(
  request: SnippetRequest,
  variables: Variables,
): Pick<Prepared, 'headers' | 'compressed'> {
  const headers: Prepared['headers'] = []
  let compressed = false
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    const key = name.toLowerCase()
    if (key === 'accept-encoding') compressed = COMPRESSED.test(value)
    if (DROPPED_HEADERS.has(key)) continue
    if (request.session && key === 'authorization') continue
    headers.push([name, unmask(value, () => name, `header ${name}`, variables)])
  }
  if (request.session) {
    headers.push(['authorization', ['Bearer ', { variable: TOKEN }]])
  }
  return { headers, compressed }
}

/** A masked value in the JSON text: a whole string, or a part of one. */
const MARK = /"\uE000(\d+)\uE001"|\uE002(\d+)\uE003/g

/**
 * A JSON body, its masked values turned into variables named after their
 * key. A value masked inside a text (a card number in a note) is a variable
 * of its own within the string: `inline`, it is no JavaScript literal.
 */
function jsonBody(
  json: unknown,
  variables: Variables,
): { parts: Part[]; inline: boolean } {
  const marked: Part[] = []
  let inline = false
  const text = JSON.stringify(json, function (key, value) {
    if (typeof value !== 'string' || !value.includes(REDACTED)) return value
    const path = Array.isArray(this) ? 'item' : key
    if (value === REDACTED) {
      marked.push(variables.add(path, redactedNote(`body field ${path}`)))
      return `\uE000${marked.length - 1}\uE001`
    }
    // Only card numbers are masked by their look, whatever the key.
    inline = true
    return value.replaceAll(REDACTED, () => {
      marked.push(
        variables.add(
          'card_number',
          redactedNote(`a card number in the text of body field ${path}`),
        ),
      )
      return `\uE002${marked.length - 1}\uE003`
    })
  })
  const parts: Part[] = []
  let from = 0
  for (const match of text.matchAll(MARK)) {
    const at = match.index ?? 0
    // A whole value keeps its quotes around the variable.
    const quote = match[1] === undefined ? 0 : 1
    parts.push(text.slice(from, at + quote))
    parts.push(marked[Number(match[1] ?? match[2])])
    from = at + match[0].length - quote
  }
  parts.push(text.slice(from))
  return { parts: parts.filter((part) => part !== ''), inline }
}

function bodyOf(
  request: SnippetRequest,
  variables: Variables,
): Body | undefined {
  const body = request.body
  if (!body || METHODS_WITHOUT_BODY.has(request.method.toUpperCase()))
    return undefined
  try {
    const json: unknown = JSON.parse(body)
    // Written again only to name its masked values: otherwise the body stays
    // as sent, its spacing and its large numbers untouched.
    if (!body.includes(REDACTED)) return { kind: 'json', parts: [body] }
    const { parts, inline } = jsonBody(json, variables)
    return { kind: inline ? 'text' : 'json', parts }
  } catch {
    // A form, plain text, or JSON cut at capture: sent as written, its masked
    // values named after the `key=` before them.
    const formKey = (before: string) =>
      before.match(/([^=&\s]+)=$/)?.[1] ?? 'value'
    return {
      kind: 'text',
      parts: unmask(body, formKey, 'body value', variables),
    }
  }
}

function prepare(request: SnippetRequest): Prepared {
  const variables = new Variables([
    ...(request.origin ? [] : [API_URL]),
    ...(request.session ? [TOKEN] : []),
  ])
  const url = urlOf(request, variables)
  const { headers, compressed } = headersOf(request, variables)
  const body = bodyOf(request, variables)
  const reserved: Variable[] = []
  if (!request.origin) {
    reserved.push({
      name: API_URL,
      note: 'the public URL of the API (the console could not tell it: set apiBaseUrl in the DMS module config)',
    })
  }
  if (request.session) {
    const login: Part[] = [url[0], LOGIN_PATH]
    reserved.push({
      name: TOKEN,
      note: `a DMS access token: the access_token POST ${request.origin || `$${API_URL}`}${LOGIN_PATH} returns`,
      command: `TOKEN=$(curl -s -X POST ${shellWord(login)} -H 'content-type: application/json' -d '{"email":"you@example.com","password":"…"}' | jq -r .access_token)`,
    })
  }
  return {
    method: request.method.toUpperCase(),
    url,
    headers,
    body,
    compressed,
    variables: [...reserved, ...variables.list],
    warnings: warningsOf(request, body),
  }
}

const TRUNCATED_WARNING =
  'Warning: the body was truncated when captured: it is incomplete and will not replay as sent'

/** Why a body was not stored, as `requestBodyOmitted` names it. */
const OMISSIONS: Record<string, string> = {
  disabled: 'body capture is off',
  'too-large': 'it was larger than the maximum body size',
  'not-json': 'only JSON bodies are captured',
  malformed: 'its JSON was invalid',
  'not-read': 'no handler read it',
}

function warningsOf(request: SnippetRequest, body: Body | undefined): string[] {
  if (body) return request.bodyTruncated ? [TRUNCATED_WARNING] : []
  const omitted = request.bodyOmitted
  // An empty body was sent empty: the command replays it as it was.
  if (!omitted || omitted === 'empty') return []
  if (METHODS_WITHOUT_BODY.has(request.method.toUpperCase())) return []
  const reason = OMISSIONS[omitted]
  return [
    `Warning: the body was not captured${reason ? ` (${reason})` : ''}: add it before running`,
  ]
}

function curlComments(prepared: Prepared): string[] {
  const lines = prepared.variables.flatMap((variable) => [
    `# ${variable.name}: ${variable.note}`,
    ...(variable.command ? [`#   ${variable.command}`] : []),
  ])
  return [...lines, ...prepared.warnings.map((warning) => `# ${warning}`)]
}

function shellVariable(name: string, next: string | undefined): string {
  return next && /^\w/.test(next) ? `\${${name}}` : `$${name}`
}

/**
 * One shell word: single-quoted while it holds no variable; with variables,
 * double-quoted when the text allows it (`"Bearer $TOKEN"`), else spliced
 * (`'{"password":"'"$PASSWORD"'"}'`).
 */
function shellWord(parts: Part[]): string {
  const single = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`
  if (parts.every((part) => typeof part === 'string'))
    return single(parts.join(''))
  const literals = parts.filter((part) => typeof part === 'string').join('')
  if (!/["\\$`!]/.test(literals)) {
    const text = parts
      .map((part, index) => {
        if (typeof part === 'string') return part
        const next = parts[index + 1]
        return shellVariable(
          part.variable,
          typeof next === 'string' ? next : undefined,
        )
      })
      .join('')
    return `"${text}"`
  }
  return parts
    .map((part) =>
      typeof part === 'string' ? single(part) : `"$${part.variable}"`,
    )
    .join('')
}

/** The request as a `curl` command, one option per line. */
export function toCurl(request: SnippetRequest): string {
  const prepared = prepare(request)
  const lines = [`curl -X ${prepared.method} ${shellWord(prepared.url)}`]
  if (prepared.compressed) lines.push('  --compressed')
  for (const [name, value] of prepared.headers) {
    lines.push(`  -H ${shellWord([`${name}: `, ...value])}`)
  }
  if (prepared.body) lines.push(`  -d ${shellWord(prepared.body.parts)}`)
  return [...curlComments(prepared), lines.join(' \\\n')].join('\n')
}

/** A JavaScript string: a template literal when it holds variables. */
function jsString(parts: Part[]): string {
  if (parts.every((part) => typeof part === 'string'))
    return JSON.stringify(parts.join(''))
  const text = parts
    .map((part) =>
      typeof part === 'string'
        ? part.replace(/[`\\]|\$\{/g, (match) => `\\${match}`)
        : `\${${part.variable}}`,
    )
    .join('')
  return `\`${text}\``
}

/** The request as a `fetch` call, its variables declared above it. */
export function toFetch(request: SnippetRequest): string {
  const prepared = prepare(request)
  const declarations = prepared.variables.map(
    (variable) => `const ${variable.name} = '' // ${variable.note}`,
  )
  for (const warning of prepared.warnings) declarations.push(`// ${warning}`)
  const init: string[] = [`  method: ${JSON.stringify(prepared.method)},`]
  if (prepared.headers.length > 0) {
    const headers = prepared.headers.map(
      ([name, value]) => `    ${JSON.stringify(name)}: ${jsString(value)},`,
    )
    init.push(`  headers: {\n${headers.join('\n')}\n  },`)
  }
  const body = prepared.body
  if (body?.kind === 'json') {
    // JSON is a JavaScript literal; a masked value is the variable itself.
    const literal = body.parts
      .map((part, index) => {
        if (typeof part !== 'string') return part.variable
        let text = part
        if (typeof body.parts[index + 1] === 'object') text = text.slice(0, -1)
        if (typeof body.parts[index - 1] === 'object') text = text.slice(1)
        return text
      })
      .join('')
    init.push(`  body: JSON.stringify(${literal}),`)
  } else if (body) {
    init.push(`  body: ${jsString(body.parts)},`)
  }
  const call = `await fetch(${jsString(prepared.url)}, {\n${init.join('\n')}\n})`
  return [...declarations, call].join('\n')
}

/** A captured request, ready for a snippet: the call as it was sent. */
export function capturedSnippetRequest(
  log: CapturedRequest,
  origin: string | null,
): SnippetRequest {
  return {
    method: log.method,
    path: log.rawPath,
    origin,
    query: log.query,
    headers: log.requestHeaders,
    body: log.requestBody,
    bodyTruncated: log.requestBodyTruncated,
    bodyOmitted: log.requestBodyOmitted,
  }
}

/**
 * A route's example call: the path and query of its last successful call,
 * its last accepted body, the session token when it expects a signed-in user.
 * No body was seen (a DELETE, a route never called): none is made up.
 */
export function routeSnippetRequest(
  route: DocumentedRoute,
  origin: string | null,
  withBody: boolean,
): SnippetRequest {
  const example = route.contract.exampleBody
  const body =
    withBody && example !== null && example !== undefined
      ? JSON.stringify(example)
      : undefined
  return {
    method: route.method,
    path: route.path,
    origin,
    pathParams: route.contract.examplePath,
    query: route.contract.exampleQuery,
    headers: body ? { 'content-type': 'application/json' } : {},
    body,
    session: route.requiresAuth,
  }
}

/** Put the values of `params` in the `:name` segments of `path`. */
export function fillPath(path: string, params: Record<string, string>): string {
  return path.replace(/:([A-Za-z_][\w]*)/g, (segment, name: string) => {
    const value = params[name]
    return value ? encodeURIComponent(value) : segment
  })
}

/** `path` with the query parameters that hold a value. */
export function withQuery(path: string, query: Record<string, string>): string {
  const search = new URLSearchParams(
    Object.entries(query).filter(([key, value]) => key && value !== ''),
  ).toString()
  return search ? `${path}?${search}` : path
}
