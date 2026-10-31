import assert from "node:assert";
import { describe, it } from "node:test";
import { readProjectFile } from "./helpers/project-file";

/** The lowest pnpm the project pins, the version the other AntelopeJS repositories pin. Measured: pnpm up to 10.13.1 fails with ENOENT on a `file:` tarball whose index the resolution step wrote under another name, in a store that has not fetched the tarball yet (#105); 10.14.0 is the first release that passes. */
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
