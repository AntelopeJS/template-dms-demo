import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const FIXED_NOW = "2026-06-15T09:00:00Z";
const PORT = process.env.PORT ?? "3001";
const FRONTEND_URL = `http://127.0.0.1:${PORT}/`;
const BACKEND_URL = "http://127.0.0.1:5010/";
const DEV_FILE = ".antelope/dev.json";
const LOG_DIRECTORY = ".antelope/capture";
const READY_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 2000;

/** The environment of a capture run: a fixed instant, UTC, and no simulators, so two runs show the same data. */
const environment = {
  ...process.env,
  PORT,
  DMS_CLIENT_BASE_URL:
    process.env.DMS_CLIENT_BASE_URL ?? `http://localhost:${PORT}`,
  TZ: "UTC",
  HELIO_NOW: process.env.HELIO_NOW ?? FIXED_NOW,
  HELIO_SIMULATORS: "off",
};

const children: ChildProcess[] = [];

function start(name: string, args: string[]): ChildProcess {
  const log = createWriteStream(`${LOG_DIRECTORY}/${name}.log`);
  const child = spawn("pnpm", ["exec", ...args], {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code, signal) => {
    if (!stopping)
      fail(
        `${name} stopped: ${signal ?? `exit code ${code}`}. See ${LOG_DIRECTORY}/${name}.log`,
      );
  });
  children.push(child);
  return child;
}

let stopping = false;

function stop(): void {
  stopping = true;
  for (const child of children) child.kill("SIGINT");
}

function fail(message: string): never {
  process.stderr.write(`capture-start: ${message}\n`);
  stop();
  process.exit(1);
}

async function waitFor(
  what: string,
  ready: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await ready()) return;
    await sleep(POLL_MS);
  }
  fail(`${what} did not become ready within ${READY_TIMEOUT_MS / 1000}s`);
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { redirect: "manual" })).status < 500;
  } catch {
    return false;
  }
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

async function main(): Promise<void> {
  for (const url of [BACKEND_URL, FRONTEND_URL])
    if (await answers(url))
      fail(
        `${url} already answers: stop what runs there, or it would be captured instead`,
      );
  mkdirSync(LOG_DIRECTORY, { recursive: true });
  rmSync(DEV_FILE, { force: true });
  start("backend", ["ajs", "project", "run"]);
  await waitFor("the backend", () => answers(BACKEND_URL));
  start("frontend", ["ajs", "dms", "dev"]);
  await waitFor("the dashboard", () => answers(FRONTEND_URL));
  process.stdout.write(`ready ${FRONTEND_URL}\n`);
}

void main();
