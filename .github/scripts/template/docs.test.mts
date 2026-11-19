import { docsJourneys } from "./journeys-repo.mts";
import { journeyTests } from "./tests.mts";

journeyTests(
  "docs",
  docsJourneys,
  new Map([
    [
      "docs-claims",
      {
        check: "README and AGENTS commands without a script",
        detail: 'expected [], got ["ratchet:update"]',
        finding:
          "AGENTS.md tells the user to run `pnpm run ratchet:update` and commit `guardrails.ratchet.json`; the template has neither the script nor the file",
      },
    ],
  ]),
);
