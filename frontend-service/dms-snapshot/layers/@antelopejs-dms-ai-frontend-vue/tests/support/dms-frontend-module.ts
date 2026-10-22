// The renderer's runtime (`#dms/frontend-module`), which only the generated
// application provides: the suites that import a view mock what they use.
export function useDmsRoute(): never {
	throw new Error("Mock #dms/frontend-module in the suite that needs it");
}

export function useDmsRouter(): never {
	throw new Error("Mock #dms/frontend-module in the suite that needs it");
}
