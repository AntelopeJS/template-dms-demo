import { defineConfig } from "oxlint";
import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";

export default defineConfig({
  extends: [
    antelopePreset({
      // Turned on repository-wide with the import-sorting pass, so the
      // reordering lands as one reviewable change everywhere at once.
      importSorting: false,
    }),
  ],
  // Front-end sources, which oxlint cannot lint yet: they move with the
  // front-end migration.
  ignorePatterns: [...ANTELOPE_IGNORE_PATTERNS, "nuxt-layer/**"],
  options: { typeAware: true },
  rules: {
    // Biome's recommended set blocked these and oxlint's correctness category
    // does not. `== null` stays allowed, as it was there. Moves into the preset
    // with its next release.
    "eslint/eqeqeq": ["error", "always", { null: "ignore" }],
    "eslint/radix": "error",
    "eslint/prefer-regex-literals": "error",
    // Staged like the rest of the type-aware family; moves into the preset
    // with its next release.
    "typescript/no-base-to-string": "warn",
  },
});
