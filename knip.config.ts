import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  // The antelope config sits at the root and loads dotenv, which the default
  // patterns do not reach. The pages and components are entry points too: a
  // decorator registers each class at import time and nothing ever imports the
  // class itself, so without this every one of them reads as a dead export.
  entry: [
    "antelope.config.ts",
    "src/components/**/*.ts",
    "src/demo-app/pages.ts",
    "src/home.ts",
  ],
});
