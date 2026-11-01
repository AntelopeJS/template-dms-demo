import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { projectPath, readProjectFile } from "./helpers/project-file";

/** The lowest dms-frontend release whose frontends are all installable: every module frontend declares `>=0.10.0 <0.11.0`. */
const FLOOR = [0, 10, 0] as const;

/** The version a `file:` tarball carries in its own package.json. */
function packedVersion(spec: string): string {
  const manifest = execFileSync(
    "tar",
    ["-xzOf", projectPath(spec.slice("file:".length)), "package/package.json"],
    { encoding: "utf8" },
  );
  const match = /"version":\s*"([^"]+)"/.exec(manifest);
  assert.ok(match, `no version in the package.json of "${spec}"`);
  return match[1] ?? "";
}

function lowestVersion(declared: string): number[] {
  const spec = declared.startsWith("file:")
    ? packedVersion(declared)
    : declared;
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
    /'@antelopejs\/dms-frontend':\s+specifier: [^\n]+\s+version: ([^\s(]+)/.exec(
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
