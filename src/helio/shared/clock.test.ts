import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";

const CLOCK = join(__dirname, "clock.js");
const INSTANT = "2026-06-15T09:00:00Z";

function readClock(env: Record<string, string>): string {
  const { HELIO_NOW: _unset, ...inherited } = process.env;
  return execFileSync(
    process.execPath,
    ["-e", `console.log(require(${JSON.stringify(CLOCK)}).helioNow())`],
    { env: { ...inherited, ...env }, encoding: "utf8", stdio: "pipe" },
  ).trim();
}

void describe("helioNow", () => {
  void it("answers the HELIO_NOW instant, whenever it is read", () => {
    const first = readClock({ HELIO_NOW: INSTANT });
    assert.strictEqual(first, String(Date.parse(INSTANT)));
    assert.strictEqual(readClock({ HELIO_NOW: INSTANT }), first);
  });

  void it("answers the real time when HELIO_NOW is unset or empty", () => {
    for (const env of [{}, { HELIO_NOW: "" }]) {
      const before = Date.now();
      const read = Number(readClock(env));
      assert.ok(read >= before && read <= Date.now(), JSON.stringify(env));
    }
  });

  void it("refuses a HELIO_NOW that is not an instant", () => {
    assert.throws(
      () => readClock({ HELIO_NOW: "next tuesday" }),
      /HELIO_NOW must be an ISO 8601 instant, got "next tuesday"/,
    );
  });
});
