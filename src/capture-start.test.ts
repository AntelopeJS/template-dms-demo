import assert from "node:assert";
import { type ChildProcess, spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  PROVISIONING_DONE,
  PROVISIONING_INCOMPLETE,
} from "./helio/platform/provisioning-report";

const BACKEND_URL = "http://127.0.0.1:5010/";
const DASHBOARD_PORT = "3291";
const NO_EXIT_MS = 30_000;

/**
 * Stands in for `pnpm exec ajs project run` and `pnpm exec ajs dms dev`. The backend answers at once and prints
 * `FAKE_PROVISIONING_LINE` after `FAKE_PROVISIONING_DELAY_MS`, on stderr for an `[ERROR]` line as the project logger
 * does and on stdout otherwise; from then on it answers `true` instead of `false`.
 */
const FAKE_SERVER = `
  const { createServer } = require("node:http");
  const backend = process.argv[4] === "project";
  let reported = false;
  const server = createServer((request, response) => response.end(String(reported)));
  server.listen(backend ? 5010 : Number(process.env.PORT), "127.0.0.1", () => {
    if (!backend) return;
    setTimeout(() => {
      const line = process.env.FAKE_PROVISIONING_LINE;
      (line.startsWith("[ERROR]") ? console.error : console.log)(line);
      reported = true;
    }, Number(process.env.FAKE_PROVISIONING_DELAY_MS));
  });
`;

const workspace = mkdtempSync(join(tmpdir(), "capture-start-"));
after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function fakePnpm(): string {
  const bin = join(workspace, "bin");
  const server = join(workspace, "fake-server.js");
  const pnpm = join(bin, "pnpm");
  writeFileSync(server, FAKE_SERVER);
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    pnpm,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(server)} "$@"\n`,
  );
  chmodSync(pnpm, 0o755);
  return bin;
}

interface Capture {
  child: ChildProcess;
  output: () => string;
  exit: Promise<number | null>;
}

function startCapture(line: string, delayMs: number): Capture {
  const bin = fakePnpm();
  const child = spawn(process.execPath, [join(__dirname, "capture-start.js")], {
    cwd: workspace,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      PORT: DASHBOARD_PORT,
      FAKE_PROVISIONING_LINE: line,
      FAKE_PROVISIONING_DELAY_MS: String(delayMs),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exit = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code));
  });
  return { child, output: () => output, exit };
}

async function printedReady(capture: Capture): Promise<void> {
  const deadline = Date.now() + NO_EXIT_MS;
  while (!/^ready /m.test(capture.output())) {
    assert.ok(Date.now() < deadline, `no ready line:\n${capture.output()}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function stopCapture(capture: Capture): Promise<void> {
  capture.child.kill("SIGTERM");
  await capture.exit;
}

async function exitCode(capture: Capture): Promise<number | null> {
  const timeout = new Promise<"running">((resolve) =>
    setTimeout(() => resolve("running"), NO_EXIT_MS).unref(),
  );
  const code = await Promise.race([capture.exit, timeout]);
  if (code === "running") await stopCapture(capture);
  return code === "running" ? null : code;
}

void describe("capture:start", () => {
  void it("prints ready only once the backend reported Helio's provisioning done", async () => {
    const capture = startCapture(`[INFO] [helio] ${PROVISIONING_DONE}`, 5000);
    try {
      await printedReady(capture);
      const reported = await (await fetch(BACKEND_URL)).text();
      assert.strictEqual(reported, "true", capture.output());
    } finally {
      await stopCapture(capture);
    }
  });

  void it("stops with code 1, without ready, when the provisioning is incomplete", async () => {
    const capture = startCapture(
      `[ERROR] [helio] ${PROVISIONING_INCOMPLETE}: marketing`,
      0,
    );
    const code = await exitCode(capture);
    assert.strictEqual(code, 1, capture.output());
    assert.doesNotMatch(capture.output(), /^ready /m);
  });
});
