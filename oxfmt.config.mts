import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

export default antelopeFmtPreset({
  // Biome never formatted Markdown, so bringing documents into a formatter for
  // the first time is a change of its own, not part of swapping the tool. The
  // Nuxt layer is out for the same reason its lint is: the front-end migration
  // moves it.
  ignorePatterns: ["nuxt-layer/**", "**/*.md"],
});
