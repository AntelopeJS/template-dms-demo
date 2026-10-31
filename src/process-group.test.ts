import assert from "node:assert";
import { describe, it } from "node:test";
import { startGroup, stopGroup } from "./process-group";

const IGNORE_INTERRUPT = "process.on('SIGINT', () => {});";
const IGNORE_TERMINATE = "process.on('SIGTERM', () => {});";
const IDLE = "setInterval(() => {}, 1000);";

/** A process that prints the pid of a grandchild it started, then idles. Both run `behaviour`. */
function tree(behaviour: string): string {
  return `
    const { spawn } = require("node:child_process");
    const grandchild = spawn(process.execPath, ["-e", ${JSON.stringify(`${behaviour}${IDLE}`)}], { stdio: "ignore" });
    ${behaviour}
    console.log(grandchild.pid);
    ${IDLE}
  `;
}

async function launch(behaviour: string) {
  const child = startGroup(process.execPath, ["-e", tree(behaviour)], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const grandchild = await new Promise<number>((resolve) => {
    child.stdout?.once("data", (chunk: Buffer) => {
      resolve(Number(chunk.toString().trim()));
    });
  });
  return { child, grandchild };
}

function alive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const QUICK = { interruptMs: 300, terminateMs: 300 };

void describe("stopGroup", () => {
  void it("stops a process and the children it started, on an interrupt", async () => {
    const { child, grandchild } = await launch("");
    await stopGroup(child, QUICK);
    assert.strictEqual(alive(child.pid), false);
    assert.strictEqual(alive(grandchild), false);
  });

  void it("terminates a group that ignores the interrupt", async () => {
    const { child, grandchild } = await launch(IGNORE_INTERRUPT);
    await stopGroup(child, QUICK);
    assert.strictEqual(alive(child.pid), false);
    assert.strictEqual(alive(grandchild), false);
  });

  void it("kills a group that ignores the interrupt and the termination", async () => {
    const { child, grandchild } = await launch(
      IGNORE_INTERRUPT + IGNORE_TERMINATE,
    );
    await stopGroup(child, QUICK);
    assert.strictEqual(alive(child.pid), false);
    assert.strictEqual(alive(grandchild), false);
  });

  void it("answers at once for a group that is already gone", async () => {
    const { child } = await launch("");
    await stopGroup(child, QUICK);
    await stopGroup(child, QUICK);
  });
});
