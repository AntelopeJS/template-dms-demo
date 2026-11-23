import assert from "node:assert";
import { describe, it } from "node:test";
import { listProjectDirectory, readProjectFile } from "./helpers/project-file";

/** The `@openai/codex` version the locked dms-assistant declares as its peer, the one its Codex integration runs against. */
function assistantPeer(): string {
  const locks = listProjectDirectory("antelope-lock/@antelopejs").filter(
    (entry) => entry.startsWith("dms-assistant@"),
  );
  assert.strictEqual(
    locks.length,
    1,
    `expected one dms-assistant lock, found ${locks.join(", ")}`,
  );
  const match =
    /"peerDependencies":\s*\{[^}]*"@openai\/codex":\s*"([^"]+)"/.exec(
      readProjectFile(
        `antelope-lock/@antelopejs/${locks[0]}/package-lock.json`,
      ),
    );
  assert.ok(match, "the locked dms-assistant declares no @openai/codex peer");
  return match[1] ?? "";
}

function declaredCodex(): string {
  const match = /"@openai\/codex":\s*"([^"]+)"/.exec(
    readProjectFile("package.json"),
  );
  assert.ok(match, "@openai/codex is not a dependency");
  return match[1] ?? "";
}

function lockedCodex(): string {
  const match =
    /'@openai\/codex':\s+specifier: [^\n]+\s+version: ([^\s(]+)/.exec(
      readProjectFile("pnpm-lock.yaml"),
    );
  assert.ok(match, "@openai/codex is not locked");
  return match[1] ?? "";
}

void describe("the @openai/codex pin", () => {
  void it("declares the version the locked dms-assistant peers on", () => {
    assert.strictEqual(declaredCodex(), assistantPeer());
  });

  void it("locks the version the locked dms-assistant peers on", () => {
    assert.strictEqual(lockedCodex(), assistantPeer());
  });
});
