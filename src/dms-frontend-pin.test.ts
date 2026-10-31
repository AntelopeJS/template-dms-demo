import assert from "node:assert";
import { describe, it } from "node:test";
import { readProjectFile } from "./helpers/project-file";

/** The lowest dms-frontend release whose frontends are all installable: dms-ai, dms-builder and dms-media declare `>=0.9.1 <0.10.0` (#106). */
const FLOOR = [0, 9, 1] as const;

function lowestVersion(spec: string): number[] {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(spec);
  assert.ok(match, `no version in "${spec}"`);
  return match.slice(1).map(Number);
}

function atLeastFloor(version: number[]): boolean {
  for (const [index, part] of FLOOR.entries()) {
    const actual = version[index] ?? 0;
    if (actual !== part) return actual > part;
  }
  return true;
}

function declaredSpec(): string {
  const match = /"@antelopejs\/dms-frontend":\s*"([^"]+)"/.exec(
    readProjectFile("package.json"),
  );
  assert.ok(match, "@antelopejs/dms-frontend is not a dependency");
  return match[1] ?? "";
}

function lockedVersion(): string {
  const match =
    /'@antelopejs\/dms-frontend':\s+specifier: [^\n]+\s+version: (\d+\.\d+\.\d+)/.exec(
      readProjectFile("pnpm-lock.yaml"),
    );
  assert.ok(match, "@antelopejs/dms-frontend is not locked");
  return match[1] ?? "";
}

void describe("the dms-frontend pin", () => {
  void it("allows only releases that run the latest module frontends", () => {
    const spec = declaredSpec();
    assert.ok(
      atLeastFloor(lowestVersion(spec)),
      `@antelopejs/dms-frontend ${spec} is below ${FLOOR.join(".")}`,
    );
  });

  void it("locks a release that runs the latest module frontends", () => {
    const version = lockedVersion();
    assert.ok(
      atLeastFloor(lowestVersion(version)),
      `@antelopejs/dms-frontend ${version} is locked below ${FLOOR.join(".")}`,
    );
  });
});
