/** Mirrors the backend `SLUG_PATTERN`: what `SendTemplate(slug)` accepts. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export const MAX_SLUG_LENGTH = 64

export const MAX_NAME_LENGTH = 120

const SLUG_SEPARATOR = '-'

const FIRST_FREE_SUFFIX = 2

export type SlugIssue = 'required' | 'format' | 'too_long' | 'taken'

export type NameIssue = 'required' | 'too_long'

/**
 * The slug a name suggests: ASCII, lowercase, words joined by dashes, cut to
 * the maximum length without a trailing dash.
 */
export function slugify(name: string): string {
	return name
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, SLUG_SEPARATOR)
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/, '')
}

/**
 * What is wrong with a slug, or `null` when it can be created: present, in
 * the backend format, short enough and not used by another template.
 */
export function validateSlug(
	slug: string,
	takenSlugs: ReadonlySet<string>,
): SlugIssue | null {
	if (!slug) return 'required'
	if (slug.length > MAX_SLUG_LENGTH) return 'too_long'
	if (!SLUG_PATTERN.test(slug)) return 'format'
	return takenSlugs.has(slug) ? 'taken' : null
}

/** What is wrong with a template name, or `null` when it is fine. */
export function validateName(name: string): NameIssue | null {
	const trimmed = name.trim()
	if (!trimmed) return 'required'
	return trimmed.length > MAX_NAME_LENGTH ? 'too_long' : null
}

/** `base` with a `-N` suffix, the base cut so the whole fits the slug limit. */
function suffixedSlug(base: string, suffix: number): string {
	const ending = `${SLUG_SEPARATOR}${suffix}`
	const kept = base.slice(0, MAX_SLUG_LENGTH - ending.length).replace(/-+$/, '')
	return `${kept}${ending}`
}

/**
 * The first free slug from `base`: itself, else `base-2`, `base-3`… cut to
 * the slug limit, so a duplicate of "welcome (copy)" never starts out refused.
 */
export function freeSlug(
	base: string,
	takenSlugs: ReadonlySet<string>,
): string {
	if (!takenSlugs.has(base)) return base
	let suffix = FIRST_FREE_SUFFIX
	while (takenSlugs.has(suffixedSlug(base, suffix))) suffix += 1
	return suffixedSlug(base, suffix)
}

/**
 * A name wrapped by `wrap` ("{name} (copy)"), the inner name cut so the whole
 * stays within the name limit.
 */
export function fitName(name: string, wrap: (inner: string) => string): string {
	const wrapped = wrap(name)
	if (wrapped.length <= MAX_NAME_LENGTH) return wrapped
	const room = Math.max(0, MAX_NAME_LENGTH - wrap('').length)
	return wrap(name.slice(0, room).trimEnd())
}
