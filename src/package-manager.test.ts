import assert from "node:assert";
import { describe, it } from "node:test";
import { readProjectFile } from "./helpers/project-file";

/** The lowest pnpm the project pins: 10.33.0. Measured: a resolving install in a fresh store fails with ENOENT on a `file:` tarball up to pnpm 10.13.1 and passes from 10.14.0 (#105), so 10.33.0 is a chosen pin, not the first fixed release. Of the 58 AntelopeJS repositories that pin a pnpm on `campaign/integration`, 9 pin 10.33.0, 35 pin 10.6.5 and 12 pin 10.2.0. */
const PINNED_FLOOR = [10, 33, 0] as const;

function pinnedPnpm(): number[] {
  const match = /"packageManager":\s*"pnpm@(\d+)\.(\d+)\.(\d+)"/.exec(
    readProjectFile("package.json"),
  );
  assert.ok(match, "package.json does not pin pnpm@x.y.z");
  return match.slice(1).map(Number);
}

function atLeast(version: number[], floor: readonly number[]): boolean {
  for (const [index, part] of floor.entries()) {
    const actual = version[index] ?? 0;
    if (actual !== part) return actual > part;
  }
  return true;
}

void describe("the pinned pnpm", () => {
  void it("pins pnpm 10.33.0 or later", () => {
    const version = pinnedPnpm();
    assert.ok(
      atLeast(version, PINNED_FLOOR),
      `package.json pins pnpm ${version.join(".")}, below ${PINNED_FLOOR.join(".")}`,
    );
  });
});
