import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			// The renderer's runtime exists in the generated application only.
			"#dms/frontend-module": resolve(
				__dirname,
				"tests/support/dms-frontend-module.ts",
			),
		},
	},
	test: {
		// Most suites need no DOM, and setting jsdom up per file is the bulk of
		// the run; the files that mount components opt in with a
		// `// @vitest-environment jsdom` header.
		environment: "node",
		include: ["tests/**/*.test.ts"],
	},
});
