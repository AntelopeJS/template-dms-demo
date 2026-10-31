import assert from "node:assert";
import { describe, it } from "node:test";
import { readProjectFile } from "./helpers/project-file";

/** pnpm 10.6.5 and older fail with ENOENT on a `file:` tarball whose index the resolution step wrote under another name, in a store that has not fetched the tarball yet (#105). */
const FIRST_FIXED = [10, 33, 0] as const;

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
  void it("resolves a file: tarball in a fresh store", () => {
    const version = pinnedPnpm();
    assert.ok(
      atLeast(version, FIRST_FIXED),
      `package.json pins pnpm ${version.join(".")}, below ${FIRST_FIXED.join(".")}`,
    );
  });
});
