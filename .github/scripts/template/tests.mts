import { execFileSync } from "node:child_process";
import { describe, test } from "node:test";

import { JourneyAbort, JourneyContext, type Journey } from "./harness.mts";
import { currentRun } from "./run.mts";

const JOURNEY_TIMEOUT_MS = 2_400_000;
const MONGO_RESET =
  "db.getMongo().getDBNames().filter((name) => !['admin', 'config', 'local'].includes(name)).forEach((name) => db.getSiblingDB(name).dropDatabase())";

async function runJourney(feature: string, id: string, journey: Journey) {
  const run = await currentRun();
  execFileSync("docker", [
    "exec",
    run.mongoContainer,
    "mongosh",
    "--quiet",
    "--eval",
    MONGO_RESET,
  ]);
  const context = new JourneyContext(run, feature, id);
  try {
    await journey.run(context);
  } catch (error) {
    if (!(error instanceof JourneyAbort)) throw error;
  } finally {
    await context.cleanup();
  }
  return context.failed();
}

/** A product defect a journey shows: the one check it fails, what that check observes, and the finding that explains it. */
export interface KnownFailure {
  check: string;
  detail: string;
  finding: string;
}

/**
 * Registers each journey as the test `<feature> › <id>`. A journey with a known failure passes only while exactly
 * that check fails with exactly that detail, so fixing the product, or breaking it further, fails the test.
 */
export function journeyTests(
  feature: string,
  journeys: Record<string, Journey>,
  knownFailures = new Map<string, KnownFailure>(),
): void {
  void describe(feature, () => {
    for (const [id, journey] of Object.entries(journeys))
      void test(id, { timeout: JOURNEY_TIMEOUT_MS }, async (t) => {
        const failed = await runJourney(feature, id, journey);
        const known = knownFailures.get(id);
        const report = failed.map((failure) => failure.line).join("\n");
        if (known === undefined) {
          if (report !== "") throw new Error(`${journey.title}\n${report}`);
          return;
        }
        t.diagnostic(`known failure: ${known.finding}`);
        const [only, ...others] = failed;
        if (
          only === undefined ||
          others.length > 0 ||
          only.name !== known.check ||
          only.detail !== known.detail
        )
          throw new Error(
            `${id} must fail only "${known.check}: ${known.detail}" (${known.finding}); it failed:\n${report || "nothing"}`,
          );
      });
  });
}
