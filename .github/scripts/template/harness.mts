import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type AddressInfo, type Server } from "node:net";
import { isAbsolute, join, relative } from "node:path";
import { describe, test } from "node:test";

import { parseJson, type Json } from "./json.mts";
import { journeyProcesses, running, withDescendants } from "./processes.mts";
import { AJS, currentRun, SHARED_CACHE, TEMPLATE, type Run } from "./run.mts";

const COMMAND_TIMEOUT_MS = 600_000;
const HTTP_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 250;
const SETTLE_MS = 3000;
const STOP_TIMEOUT_MS = 30_000;
const JOURNEY_TIMEOUT_MS = 2_400_000;
const EXCERPT = 600;
const MONGO_RESET =
  "db.getMongo().getDBNames().filter((name) => !['admin', 'config', 'local'].includes(name)).forEach((name) => db.getSiblingDB(name).dropDatabase())";

/** The line the DMS prints at every start while no owner exists, as the README shows it. */
export const ONBOARDING_LINE =
  /No owner exists yet\. To create it, open (\S+)\/onboarding\?token=(\S+)/;

/** One expectation a step met or missed, with what was observed. */
export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** What one command produced; `step` names it in a failure. */
export interface CommandResult {
  step: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

/** The answer of an HTTP request, or the network error when nothing answered. */
export interface HttpResult {
  step: string;
  url: string;
  status: number | null;
  body: string;
  json: Json | undefined;
  error: string | null;
}

/** A started `ajs project dev`, and the folder its `stdout.txt` and `stderr.txt` go to. */
export interface App {
  name: string;
  pid: number;
  folder: string;
  port: number;
  exited: Promise<{ exitCode: number | null; signal: string | null }>;
}

/** Extra environment and flags of `context.dev`. */
export interface DevOptions {
  env?: Record<string, string>;
  args?: string[];
}

/** The working folder, extra environment and time limit of a command. */
export interface DriveOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

/** A journey of the template: what it checks, where a user starts it, and its steps. */
export interface Journey {
  title: string;
  entryPoint: string;
  run(context: JourneyContext): Promise<void>;
}

class JourneyAbort extends Error {}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT ? `…${flat.slice(-EXCERPT)}` : flat;
}

/** The process exited with `code`; the detail carries the end of its output. */
export function exitIs(result: CommandResult, code: number): Check {
  return {
    name: `exit code ${code}`,
    pass: result.exitCode === code,
    detail: `exit code ${result.exitCode}, signal ${result.signal}: ${excerpt(`${result.stdout}\n${result.stderr}`)}`,
  };
}

/** The process ended on SIGINT, by exit code 130 or by the signal itself. */
export function interrupted(result: {
  exitCode: number | null;
  signal: string | null;
}): Check {
  return {
    name: "ended by SIGINT (exit 130)",
    pass: result.exitCode === 130 || result.signal === "SIGINT",
    detail: `exit code ${result.exitCode}, signal ${result.signal}`,
  };
}

/** `text` matches `pattern`; `label` names the stream. */
export function has(label: string, text: string, pattern: RegExp): Check {
  return {
    name: `${label} matches ${pattern}`,
    pass: pattern.test(text),
    detail: excerpt(text),
  };
}

/** `text` does not match `pattern`. */
export function lacks(label: string, text: string, pattern: RegExp): Check {
  return {
    name: `${label} does not match ${pattern}`,
    pass: !pattern.test(text),
    detail: excerpt(text),
  };
}

/** Two values are deeply equal once serialized. */
export function equal(
  name: string,
  actual: Json | undefined,
  expected: Json,
): Check {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  return {
    name,
    pass: left === right,
    detail: `expected ${right}, got ${left}`,
  };
}

/** Nothing answered the request. */
export function refused(result: HttpResult): Check {
  return {
    name: `${result.url} is refused`,
    pass: result.status === null,
    detail: result.error ?? `status ${result.status}`,
  };
}

function slug(name: string): string {
  return name.replace(/\W+/g, "-").slice(0, 60);
}

/** Repoints each absolute symlink of `copy` that targets `source` at the same path in `copy`. */
function relink(source: string, copy: string): void {
  for (const entry of readdirSync(copy, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isSymbolicLink()) continue;
    const path = join(entry.parentPath, entry.name);
    const target = readlinkSync(path);
    const inside = relative(source, target);
    if (!isAbsolute(target) || inside.startsWith("..")) continue;
    unlinkSync(path);
    symlinkSync(join(copy, inside), path);
  }
}

/** What a journey drives the scaffolded project through: commands, HTTP, the run's MongoDB and started apps. */
export class JourneyContext {
  readonly work: string;
  readonly home: string;
  private readonly run: Run;
  private readonly failures: string[] = [];
  private readonly apps = new Set<App>();
  private steps = 0;

  constructor(run: Run, feature: string, id: string) {
    this.run = run;
    this.work = join(run.dir, "work", feature, id);
    this.home = join(run.dir, "homes", feature, id);
    for (const folder of [this.work, this.home]) {
      rmSync(folder, { recursive: true, force: true });
      mkdirSync(folder, { recursive: true });
    }
  }

  /** The environment every command gets: the journey's own HOME, CI=1, no update check, no colors, and the shared package caches. */
  private env(extra: Record<string, string> = {}) {
    const kept = Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        !/^(antelopejs_|npm_|pnpm_|xdg_)/i.test(entry[0]),
    );
    return {
      ...Object.fromEntries(kept),
      HOME: this.home,
      CI: "1",
      AJS_NO_UPDATE_CHECK: "1",
      NO_COLOR: "1",
      XDG_DATA_HOME: join(SHARED_CACHE, "xdg-data"),
      XDG_CACHE_HOME: join(this.home, ".cache"),
      XDG_CONFIG_HOME: join(this.home, ".config"),
      npm_config_cache: join(SHARED_CACHE, "npm"),
      GIT_CONFIG_NOSYSTEM: "1",
      MONGODB_URL: "mongodb://127.0.0.1:9",
      ...extra,
    };
  }

  private step(name: string): string {
    this.steps += 1;
    return `${String(this.steps).padStart(2, "0")} ${name}`;
  }

  /** Runs `program` in its own process group, killed with its children after `timeoutMs`. */
  command(
    name: string,
    program: string,
    args: string[],
    options: DriveOptions = {},
  ): Promise<CommandResult> {
    const step = this.step(name);
    return new Promise((resolve) => {
      const child = spawn(program, args, {
        cwd: options.cwd ?? this.work,
        env: this.env(options.env),
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      const timer = setTimeout(() => {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);
      const finish = (
        exitCode: number | null,
        signal: string | null,
        failure = "",
      ) => {
        clearTimeout(timer);
        resolve({
          step,
          exitCode,
          signal,
          stdout: Buffer.concat(out).toString("utf8"),
          stderr: `${Buffer.concat(err).toString("utf8")}${failure}`,
        });
      };
      child.on("error", (error) => finish(null, null, `${error.message}\n`));
      child.on("close", (code, signal) => finish(code, signal));
    });
  }

  /** Runs `ajs` of the repository's `@antelopejs/core`. */
  ajs(name: string, args: string[], options: DriveOptions = {}) {
    return this.command(name, AJS, args, options);
  }

  /** Writes `content` to `file` as a new inode, so the write reaches no hard-linked copy. */
  edit(name: string, file: string, content: string): string {
    mkdirSync(join(file, ".."), { recursive: true });
    rmSync(file, { force: true });
    writeFileSync(file, content);
    return this.step(name);
  }

  /** One HTTP request; a request nothing answered has a `null` status and the network error. */
  async http(
    name: string,
    url: string,
    init: { method?: string; body?: string } = {},
  ): Promise<HttpResult> {
    const step = this.step(name);
    try {
      const response = await fetch(url, {
        method: init.method ?? "GET",
        body: init.body,
        headers:
          init.body === undefined ? {} : { "content-type": "application/json" },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const body = await response.text();
      return {
        step,
        url,
        status: response.status,
        body,
        json: parseJson(body),
        error: null,
      };
    } catch (error) {
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : String(error);
      return {
        step,
        url,
        status: null,
        body: "",
        json: undefined,
        error: cause,
      };
    }
  }

  /** Records the checks of a step; a failing `critical` step ends the journey. */
  expect(step: string, checks: Check[], options: { critical?: boolean } = {}) {
    const failed = checks.filter((check) => !check.pass);
    for (const check of failed)
      this.failures.push(`[${step}] ${check.name}: ${check.detail}`);
    if (failed.length > 0 && options.critical === true)
      throw new JourneyAbort(`critical step ${step} failed`);
    return failed.length === 0;
  }

  /** The connection string of the run's MongoDB, emptied before each journey. */
  get mongoUrl(): string {
    return this.run.mongoUrl;
  }

  /** Runs `mongosh` with `args` inside the run's MongoDB container. */
  mongosh(name: string, args: string[]): Promise<CommandResult> {
    return this.command(name, "docker", [
      "exec",
      this.run.mongoContainer,
      "mongosh",
      ...args,
    ]);
  }

  /** Points `ajs` at the run's offline manifest, then creates `project` from the template with `ajs project init`. */
  async scaffold(name: string, project: string): Promise<CommandResult> {
    const set = await this.ajs("ajs config set git", [
      "config",
      "set",
      "git",
      this.run.manifestUrl,
    ]);
    this.expect(set.step, [exitIs(set, 0)], { critical: true });
    return this.ajs(name, [
      "project",
      "init",
      relative(this.work, project),
      "--template",
      TEMPLATE,
      "--pm",
      "pnpm",
      "--git-init",
    ]);
  }

  /** Builds `<work>/<key>` with `build` once per run, then gives every later journey its own copy of that build. */
  async prepared(
    key: string,
    build: (folder: string) => Promise<void>,
  ): Promise<string> {
    const folder = join(this.work, key);
    const kept = this.run.prepared.get(key);
    if (kept !== undefined) {
      execFileSync("cp", ["-a", "--reflink=auto", kept, folder]);
      relink(kept, folder);
      return folder;
    }
    mkdirSync(folder);
    const before = this.failures.length;
    await build(folder);
    if (this.failures.length === before) {
      const copy = join(this.run.dir, "prepared", key);
      mkdirSync(join(copy, ".."), { recursive: true });
      execFileSync("cp", ["-a", "--reflink=auto", folder, copy]);
      relink(folder, copy);
      this.run.prepared.set(key, copy);
    }
    return folder;
  }

  /** Starts `ajs project dev` on a free `PORT` in `project` and waits until it prints the onboarding line and keeps running. */
  async dev(name: string, project: string, options: DevOptions = {}) {
    const step = this.step(name);
    const folder = join(this.work, "apps", slug(step));
    mkdirSync(folder, { recursive: true });
    const port = await freePort();
    const stdout = openSync(join(folder, "stdout.txt"), "w");
    const stderr = openSync(join(folder, "stderr.txt"), "w");
    const child = spawn(AJS, ["project", "dev", ...(options.args ?? [])], {
      cwd: project,
      env: this.env({ PORT: String(port), ...options.env }),
      detached: true,
      stdio: ["ignore", stdout, stderr],
    });
    closeSync(stdout);
    closeSync(stderr);
    const exited = new Promise<{
      exitCode: number | null;
      signal: string | null;
    }>((resolve) =>
      child.on("exit", (exitCode, signal) => resolve({ exitCode, signal })),
    );
    if (child.pid === undefined) throw new Error(`could not start ${name}`);
    const app: App = { name, pid: child.pid, folder, port, exited };
    this.apps.add(app);
    await this.ready(step, app);
    return app;
  }

  private async ready(step: string, app: App): Promise<void> {
    let gone = false;
    void app.exited.then(() => {
      gone = true;
    });
    const deadline = Date.now() + READY_TIMEOUT_MS;
    const printed = () => ONBOARDING_LINE.test(outputOf(app));
    while (!printed() && !gone && Date.now() < deadline)
      await sleep(READY_POLL_MS);
    const ready = printed();
    if (ready) await sleep(SETTLE_MS);
    this.expect(
      step,
      [
        {
          name: `the output matches ${ONBOARDING_LINE}`,
          pass: ready,
          detail: excerpt(outputOf(app)),
        },
        {
          name: "still running after readiness",
          pass: !gone,
          detail: `waited ${SETTLE_MS} ms`,
        },
      ],
      { critical: true },
    );
  }

  /** Sends Ctrl+C (SIGINT) to an app, and kills its process group when it has not exited 30 s later. */
  async stop(name: string, app: App) {
    const step = this.step(name);
    this.apps.delete(app);
    try {
      process.kill(app.pid, "SIGINT");
    } catch {
      return { step, exitCode: null, signal: null, ...readOutput(app) };
    }
    const outcome = await Promise.race([
      app.exited,
      sleep(STOP_TIMEOUT_MS).then(() => undefined),
    ]);
    if (outcome === undefined) killGroup(app.pid);
    return {
      step,
      ...(outcome ?? { exitCode: null, signal: "SIGKILL" }),
      ...readOutput(app),
    };
  }

  /** Stops every app still running, then kills whatever the journey left behind. */
  async cleanup(): Promise<void> {
    for (const app of this.apps) await this.stop(`cleanup ${app.name}`, app);
    for (const pid of withDescendants(journeyProcesses(this)))
      if (running(pid)) killGroup(pid);
    rmSync(this.work, { recursive: true, force: true });
    rmSync(this.home, { recursive: true, force: true });
  }

  /** Every failed check, one per line, or an empty string. */
  report(): string {
    return this.failures.join("\n");
  }
}

function killGroup(pid: number): void {
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, "SIGKILL");
      return;
    } catch {
      continue;
    }
  }
}

function readOutput(app: App) {
  const read = (file: string) => {
    try {
      return readFileSync(join(app.folder, file), "utf8");
    } catch {
      return "";
    }
  };
  return { stdout: read("stdout.txt"), stderr: read("stderr.txt") };
}

/** Everything a started app wrote to its stdout and stderr. */
export function outputOf(app: App): string {
  const { stdout, stderr } = readOutput(app);
  return `${stdout}\n${stderr}`;
}

/** Waits `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAddress(
  address: ReturnType<Server["address"]>,
): address is AddressInfo {
  return typeof address === "object" && address !== null;
}

/** A TCP port the kernel just handed out. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!isAddress(address)) {
        reject(new Error("the server did not bind a TCP port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function runJourney(feature: string, id: string, journey: Journey) {
  const run = await currentRun();
  execFileSync("docker", [
    "exec",
    run.mongoContainer,
    "mongosh",
    "--quiet",
    "--eval",
    MONGO_RESET,
  ]);
  const context = new JourneyContext(run, feature, id);
  try {
    await journey.run(context);
  } catch (error) {
    if (!(error instanceof JourneyAbort)) throw error;
  } finally {
    await context.cleanup();
  }
  const report = context.report();
  if (report !== "") throw new Error(`${journey.title}\n${report}`);
}

/** Registers each journey as the test `<feature> › <id>`. */
export function journeyTests(
  feature: string,
  journeys: Record<string, Journey>,
): void {
  void describe(feature, () => {
    for (const [id, journey] of Object.entries(journeys))
      void test(id, { timeout: JOURNEY_TIMEOUT_MS }, () =>
        runJourney(feature, id, journey),
      );
  });
}
