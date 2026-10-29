import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  /**
   * The antelope config sits at the root and loads dotenv, which the default patterns do not reach.
   * `src/home.ts` is an entry point too: decorators register the pages at import time and nothing
   * imports the classes themselves, so without it every page reads as a dead export.
   */
  entry: ["antelope.config.ts", "src/home.ts"],
});
