import type { ChildProcess } from "node:child_process";
import { copyFileSync, createWriteStream, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { startGroup, stopGroup } from "./process-group";

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

/**
 * The preload is copied out of `dist`, because the project's own `pnpm run build` (`rimraf dist && tsc`) runs under
 * this `NODE_OPTIONS` too and empties `dist` while the preload is still being required.
 */
const CLOCK_FILE = resolve(LOG_DIRECTORY, "capture-clock.js");

/**
 * The backend and the frontend server run on the clock `HELIO_NOW` fixes: the backend so the stamps its modules
 * write are the same on every run, the frontend server so a server render hands the browser that instant as now
 * (the periods' bounds and the relative dates read it).
 */
const clockEnvironment = {
  ...environment,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require ${CLOCK_FILE}`]
    .filter(Boolean)
    .join(" "),
};

const children: ChildProcess[] = [];

function start(
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const log = createWriteStream(`${LOG_DIRECTORY}/${name}.log`);
  const child = startGroup("pnpm", ["exec", ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  child.on("exit", (code, signal) => {
    if (!stopping)
      void fail(
        `${name} stopped: ${signal ?? `exit code ${code}`}. See ${LOG_DIRECTORY}/${name}.log`,
      );
  });
  children.push(child);
  return child;
}

let stopping = false;

async function stop(): Promise<void> {
  stopping = true;
  await Promise.all(children.map((child) => stopGroup(child)));
}

async function fail(message: string): Promise<never> {
  process.stderr.write(`capture-start: ${message}\n`);
  await stop();
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
  return fail(
    `${what} did not become ready within ${READY_TIMEOUT_MS / 1000}s`,
  );
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { redirect: "manual" })).status < 500;
  } catch {
    return false;
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void stop().then(() => process.exit(0));
  });

async function main(): Promise<void> {
  for (const url of [BACKEND_URL, FRONTEND_URL])
    if (await answers(url))
      return fail(
        `${url} already answers: stop what runs there, or it would be captured instead`,
      );
  mkdirSync(LOG_DIRECTORY, { recursive: true });
  copyFileSync(join(__dirname, "capture-clock.js"), CLOCK_FILE);
  rmSync(DEV_FILE, { force: true });
  start("backend", ["ajs", "project", "run"], clockEnvironment);
  await waitFor("the backend", () => answers(BACKEND_URL));
  start("frontend", ["ajs", "dms", "dev"], clockEnvironment);
  await waitFor("the dashboard", () => answers(FRONTEND_URL));
  process.stdout.write(`ready ${FRONTEND_URL}\n`);
}

void main();
