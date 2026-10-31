import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";

const PRELOAD = join(__dirname, "..", "scripts", "capture-clock.cjs");
const INSTANT = "2026-06-15T09:00:00Z";

function run(expression: string, env: Record<string, string>): string {
  const { HELIO_NOW: _unset, ...inherited } = process.env;
  return execFileSync(
    process.execPath,
    ["--require", PRELOAD, "-e", `console.log(${expression})`],
    { env: { ...inherited, ...env }, encoding: "utf8", stdio: "pipe" },
  ).trim();
}

const WAIT_20_MS =
  "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)";

void describe("the capture clock preload", () => {
  void it("reads HELIO_NOW for a new Date and Date.now, and does not advance", () => {
    const readings = run(
      `[new Date().toISOString(), Date.now(), (${WAIT_20_MS}, new Date().toISOString()), Date.now()].join(" ")`,
      { HELIO_NOW: INSTANT },
    ).split(" ");
    const iso = new Date(INSTANT).toISOString();
    assert.deepStrictEqual(readings, [
      iso,
      String(Date.parse(INSTANT)),
      iso,
      String(Date.parse(INSTANT)),
    ]);
  });

  void it("leaves explicit dates and the static helpers alone", () => {
    const answer = run(
      `[new Date(0).toISOString(), new Date("2020-02-03T04:05:06Z").getTime(), new Date(2020, 1, 3).getFullYear(), Date.UTC(2020, 1, 3), Date.parse("2020-02-03T00:00:00Z")].join(" ")`,
      { HELIO_NOW: INSTANT, TZ: "UTC" },
    );
    assert.strictEqual(
      answer,
      [
        "1970-01-01T00:00:00.000Z",
        Date.parse("2020-02-03T04:05:06Z"),
        2020,
        Date.UTC(2020, 1, 3),
        Date.parse("2020-02-03T00:00:00Z"),
      ].join(" "),
    );
  });

  void it("keeps Date a Date: instanceof, the type tag, JSON and a call without new", () => {
    const answer = run(
      `[new Date() instanceof Date, Object.prototype.toString.call(new Date()), JSON.stringify({ at: new Date() }), typeof Date(), Date.name].join(" ")`,
      { HELIO_NOW: INSTANT },
    );
    assert.strictEqual(
      answer,
      `true [object Date] {"at":"${new Date(INSTANT).toISOString()}"} string Date`,
    );
  });

  void it("keeps the real clock when HELIO_NOW is unset or empty", () => {
    const environments: Record<string, string>[] = [{}, { HELIO_NOW: "" }];
    for (const env of environments) {
      const before = Date.now();
      const read = Number(run("Date.now()", env));
      assert.ok(read >= before && read <= Date.now(), JSON.stringify(env));
    }
  });

  void it("refuses a HELIO_NOW that is not an instant", () => {
    assert.throws(() => run("1", { HELIO_NOW: "tomorrow" }), /HELIO_NOW/);
  });
});
