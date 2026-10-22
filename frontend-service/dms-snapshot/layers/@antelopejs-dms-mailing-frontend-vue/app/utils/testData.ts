export function parseTestData(source: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(source)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
			return null
		return parsed as Record<string, unknown>
	} catch {
		return null
	}
}
