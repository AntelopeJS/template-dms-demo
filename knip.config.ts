import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  // The AntelopeJS CLI is installed globally, not as a dependency. Moves
  // into the preset with its next release.
  ignoreBinaries: ["ajs"],
  // The antelope config sits at the root and loads dotenv, which the default
  // patterns do not reach.
  entry: ["antelope.config.ts"],
  project: ["antelope.config.ts"],
});
