import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

export default antelopeFmtPreset({
  // Biome never formatted Markdown, so bringing documents into a formatter for
  // the first time is a change of its own, not part of swapping the tool. The
  // frontend module has its own Prettier configuration (`pnpm --dir
  // frontend-vue format`), which is the house style for Vue sources.
  ignorePatterns: ["frontend-vue/**", "**/*.md", "**/*.vue"],
});
