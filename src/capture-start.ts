import type { ChildProcess } from "node:child_process";
import { copyFileSync, createWriteStream, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { captureEnvironment } from "./capture-environment";
import {
  type ProvisioningOutcome,
  provisioningOutcome,
} from "./helio/platform/provisioning-report";
import { startGroup, stopGroup } from "./process-group";

const environment = captureEnvironment(process.env);
const { PORT } = environment;
const FRONTEND_URL = `http://127.0.0.1:${PORT}/`;
const BACKEND_URL = "http://127.0.0.1:5010/";
const DEV_FILE = ".antelope/dev.json";
const LOG_DIRECTORY = ".antelope/capture";
const READY_TIMEOUT_MS = 10 * 60 * 1000;
const PROVISIONING_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_MS = 500;

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
  timeoutMs = READY_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ready()) return;
    await sleep(POLL_MS);
  }
  return fail(`${what} did not become ready within ${timeoutMs / 1000}s`);
}

/**
 * Follows the outcome of Helio's default-tenant provisioning in the lines `backend` prints, on stdout and on stderr
 * where the project logger writes errors, and fails as soon as it reports a failed step.
 */
function followProvisioning(backend: ChildProcess): () => boolean {
  let outcome: ProvisioningOutcome | undefined;
  const follow = (line: string): void => {
    if (outcome) return;
    outcome = provisioningOutcome(line);
    if (outcome === "incomplete")
      void fail(
        `Helio's provisioning is incomplete. See ${LOG_DIRECTORY}/backend.log`,
      );
  };
  for (const input of [backend.stdout, backend.stderr])
    if (input) createInterface({ input }).on("line", follow);
  return () => outcome === "done";
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
  const provisioned = followProvisioning(
    start("backend", ["ajs", "project", "run"], clockEnvironment),
  );
  await waitFor("the backend", () => answers(BACKEND_URL));
  start("frontend", ["ajs", "dms", "dev"], clockEnvironment);
  await waitFor("the dashboard", () => answers(FRONTEND_URL));
  await waitFor(
    "Helio's provisioning",
    async () => provisioned(),
    PROVISIONING_TIMEOUT_MS,
  );
  process.stdout.write(`ready ${FRONTEND_URL}\n`);
}

void main();
