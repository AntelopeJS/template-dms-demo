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
    // What is left is one `max-lines` warning on src/demo-app/pages.ts, a
    // module-boundary decision rather than a defect. The two that went with
    // it were dropped by tooling-configs 0.0.4 leaving eight anti-slop
    // rules off, not repaired. It never goes up, and a new warning fails
    // CI. Here rather than in the lint script so any direct oxlint run is
    // held to it too; `lint:fix` opts out with its own `--max-warnings`,
    // since a fix pass is not a gate.
    maxWarnings: 1,
  },
});
