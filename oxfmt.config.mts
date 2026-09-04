import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

export default antelopeFmtPreset({
  ignorePatterns: ["nuxt-layer/**", "**/*.md", "**/*.vue"],
});
