/**
 * The tag a site pastes to load the tracker, in the shapes the install guide
 * offers. Built from the API origin the dashboard talks to, which is where the
 * tracker and the collect endpoint live.
 */
export type SnippetFlavor = 'html' | 'nuxt' | 'gtm'

// Split so a bundler or a linter never reads a real closing tag here.
const CLOSING_TAG = '</' + 'script>'

export function trackerUrl(apiOrigin: string): string {
  return `${apiOrigin.replace(/\/$/, '')}/api/marketing/tracker.js`
}

const BUILDERS: Record<
  SnippetFlavor,
  (src: string, websiteId: string) => string
> = {
  html: (src, websiteId) =>
    `<script defer src="${src}"\n        data-website-id="${websiteId}">${CLOSING_TAG}`,
  nuxt: (src, websiteId) =>
    [
      '// nuxt.config.ts',
      'export default defineNuxtConfig({',
      '  app: {',
      '    head: {',
      `      script: [{ src: "${src}", defer: true, "data-website-id": "${websiteId}" }],`,
      '    },',
      '  },',
      '})',
    ].join('\n'),
  gtm: (src, websiteId) =>
    [
      '<!-- Custom HTML tag, fired on All Pages -->',
      '<script>',
      '  (function () {',
      '    var s = document.createElement("script");',
      `    s.src = "${src}";`,
      '    s.defer = true;',
      `    s.setAttribute("data-website-id", "${websiteId}");`,
      '    document.head.appendChild(s);',
      '  })();',
      CLOSING_TAG,
    ].join('\n'),
}

export function trackerSnippet(
  flavor: SnippetFlavor,
  apiOrigin: string,
  websiteId: string,
): string {
  return BUILDERS[flavor](trackerUrl(apiOrigin), websiteId)
}
