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
  options: {
    typeAware: true,
    // Ceiling on the warning debt this repository starts with, so CI
    // catches the new ones. It comes down as they get fixed; it never
    // goes up. Here rather than in the lint script so `lint:fix` and
    // any direct oxlint run share the same budget.
    maxWarnings: 1,
  },
});
