import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  equal,
  exitIs,
  ONBOARDING_LINE,
  outputOf,
  sleep,
  type App,
  type DevOptions,
  type JourneyContext,
} from "./harness.mts";
import { isNumber, parseJson, pick, text, type Json } from "./json.mts";
import { journeyProcesses, running, withDescendants } from "./processes.mts";

/** The database `antelope.config.ts` names when `MONGODB_DATABASE` is unset. */
export const DATABASE = "template_dms_demo";
/** The databases MongoDB holds before anything writes to it. */
const SYSTEM_DATABASES = ["admin", "config", "local"];
/** A password the README's policy accepts. */
export const PASSWORD = "Verify1!pass";
const API_ATTEMPTS = 120;
const POLL_MS = 500;
const STOP_MS = 30_000;
const SIGNAL_MS = 5000;

/** The collection a table of the template's own schema is stored in. */
export function demoCollection(table: string): string {
  return `template-dms-demo__${table}`;
}

/**
 * The journey's own copy of the project `ajs project init` creates, as a user does, with both workspace packages
 * installed. The run builds it once under the `scaffolded` key, so every journey of the run copies one build.
 */
export async function scaffolded(context: JourneyContext): Promise<string> {
  return context.prepared("scaffolded", async (project) => {
    const init = await context.scaffold("ajs project init", project);
    context.expect(init.step, [exitIs(init, 0)], { critical: true });
    const install = await context.command(
      "pnpm install",
      "pnpm",
      ["install", "--frozen-lockfile", "--prefer-offline"],
      { cwd: project },
    );
    context.expect(install.step, [exitIs(install, 0)], { critical: true });
  });
}

/** The API origin `.antelope/dev.json` records, as `ajs dms dev` discovers it; empty when the file is missing. */
function devOrigin(project: string): string {
  let recorded: Json;
  try {
    recorded = parseJson(
      readFileSync(join(project, ".antelope", "dev.json"), "utf8"),
    );
  } catch {
    return "";
  }
  const endpoint = pick(recorded, "servers", "api", "endpoints", 0);
  const port = pick(endpoint, "port");
  if (!isNumber(port)) return "";
  const host = text(pick(endpoint, "host"));
  const reachable = ["", "0.0.0.0", "::"].includes(host) ? "127.0.0.1" : host;
  return `http://${reachable.includes(":") ? `[${reachable}]` : reachable}:${port}`;
}

/** A running backend: its API origin, and the onboarding origin and setup token its log printed. */
export interface Api {
  api: string;
  onboarding: string;
  setupToken: string;
}

/** A backend started with `ajs project dev --watch`. */
export interface Backend extends Api {
  app: App;
}

/** Waits until the API answers `/api/system-state`; the API answers 503 until every module started. */
export async function waitForApi(
  context: JourneyContext,
  api: string,
): Promise<void> {
  let answer = await context.http("the API answers", `${api}/api/system-state`);
  for (
    let attempt = 1;
    attempt < API_ATTEMPTS && answer.status !== 200;
    attempt += 1
  ) {
    await sleep(POLL_MS);
    answer = await context.http("the API answers", `${api}/api/system-state`);
  }
  context.expect(
    answer.step,
    [equal("/api/system-state answers 200", answer.status, 200)],
    { critical: true },
  );
}

/**
 * Starts the backend as `pnpm dev` does (`ajs project dev --watch`), with `MONGODB_URL` pointing at the run's
 * MongoDB as the README's optional `.env` would, and waits for the onboarding line and the API.
 */
export async function startBackend(
  context: JourneyContext,
  project: string,
  options: DevOptions = {},
): Promise<Backend> {
  const app = await context.dev("ajs project dev --watch", project, {
    args: ["--watch", ...(options.args ?? [])],
    env: { MONGODB_URL: context.mongoUrl, ...options.env },
  });
  const line = ONBOARDING_LINE.exec(outputOf(app));
  const api = devOrigin(project);
  context.expect(
    app.name,
    [
      equal(
        "the log prints the onboarding address with a setup token",
        line !== null,
        true,
      ),
      equal("`.antelope/dev.json` records the API endpoint", api !== "", true),
    ],
    { critical: true },
  );
  await waitForApi(context, api);
  return { app, api, onboarding: line?.[1] ?? "", setupToken: line?.[2] ?? "" };
}

/** What the API answered to a request sent with curl. */
export interface Reply {
  step: string;
  status: number;
  body: Json;
}

/** The parts of a request beyond its path; the method is GET, or POST when a body is sent. */
export interface Send {
  method?: string;
  token?: string;
  body?: Json;
  language?: string;
}

/** One request to the API through curl, with a bearer token, a content language and a JSON body when given. */
export async function call(
  context: JourneyContext,
  backend: Api,
  name: string,
  path: string,
  send: Send = {},
): Promise<Reply> {
  const bodyFile = join(context.work, `${name.replace(/\W+/g, "-")}.out`);
  const method = send.method ?? (send.body === undefined ? "GET" : "POST");
  const args = [
    "-sS",
    "-o",
    bodyFile,
    "-w",
    "%{http_code}",
    "-X",
    method,
    "-H",
    "content-type: application/json",
  ];
  if (send.token !== undefined)
    args.push("-H", `authorization: Bearer ${send.token}`);
  if (send.language !== undefined)
    args.push("-H", `x-content-language: ${send.language}`);
  if (send.body !== undefined)
    args.push("--data-binary", JSON.stringify(send.body));
  args.push(`${backend.api}${path}`);
  const result = await context.command(name, "curl", args);
  let body = "";
  try {
    body = readFileSync(bodyFile, "utf8");
  } catch {
    body = "";
  }
  return {
    step: result.step,
    status: Number(result.stdout.trim()),
    body: parseJson(body),
  };
}

/** The owner the first-run wizard created and the access token a login gave them. */
export interface Owner {
  email: string;
  token: string;
}

/** Creates the first administrator as the onboarding wizard does, with the token the log printed, then logs in. */
export async function createOwner(
  context: JourneyContext,
  backend: Api,
  email = "owner@example.com",
): Promise<Owner> {
  const registered = await call(
    context,
    backend,
    "create the owner",
    "/api/onboarding/register",
    {
      body: {
        email,
        firstName: "Ada",
        lastName: "Owner",
        password: PASSWORD,
        setupToken: backend.setupToken,
      },
    },
  );
  context.expect(
    registered.step,
    [equal("the wizard creates the owner", registered.status, 200)],
    { critical: true },
  );
  const login = await call(
    context,
    backend,
    "log in as the owner",
    "/api/auth/login",
    { body: { email, password: PASSWORD } },
  );
  const token = text(pick(login.body, "access_token"));
  context.expect(
    login.step,
    [
      equal(
        "the login answers 200 with an access token",
        [login.status, token !== ""],
        [200, true],
      ),
    ],
    {
      critical: true,
    },
  );
  return { email, token };
}

/** Reads the run's MongoDB through its own shell: `expression` runs against `database` and its JSON comes back. */
export async function mongo(
  context: JourneyContext,
  name: string,
  expression: string,
  database = DATABASE,
): Promise<{ step: string; value: Json }> {
  const read = await context.mongosh(name, [
    "--quiet",
    database,
    "--eval",
    `JSON.stringify(${expression})`,
  ]);
  return { step: read.step, value: parseJson(read.stdout.trim()) };
}

/** The databases the run's MongoDB holds besides its own. */
export async function databases(
  context: JourneyContext,
  name: string,
): Promise<{ step: string; names: Json }> {
  const read = await mongo(
    context,
    name,
    "db.adminCommand({ listDatabases: 1 }).databases.map((entry) => entry.name).sort()",
  );
  const names = Array.isArray(read.value)
    ? read.value.filter((entry) => !SYSTEM_DATABASES.includes(text(entry)))
    : read.value;
  return { step: read.step, names };
}

/** A long-running command started in its own process group, outside the harness, the file its output goes to, and the journey's processes that were already running when it started. */
export interface Detached {
  pid: number;
  log: string;
  before: number[];
}

/** Whether a process is still running. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts `command` with `setsid` in its own process group, its output in a log file of the journey's scratch folder.
 * `sh` starts a background job with Ctrl+C (SIGINT) ignored, so `env --default-signal=INT` restores it for
 * `stopDetached`.
 */
export async function startDetached(
  context: JourneyContext,
  name: string,
  project: string,
  command: string,
  env: Record<string, string>,
): Promise<Detached> {
  const log = join(context.work, `${name.replace(/\W+/g, "-")}.log`);
  const before = journeyProcesses(context);
  const started = await context.command(
    name,
    "sh",
    [
      "-c",
      `setsid env --default-signal=INT ${command} > '${log}' 2>&1 < /dev/null & echo $!`,
    ],
    { cwd: project, env },
  );
  const pid = Number(started.stdout.trim());
  context.expect(
    started.step,
    [exitIs(started, 0), equal("the process started", pid > 0, true)],
    { critical: true },
  );
  return { pid, log, before };
}

/** What a detached command wrote so far. */
export function logOf(detached: Detached): string {
  try {
    return readFileSync(detached.log, "utf8");
  } catch {
    return "";
  }
}

/** The processes started since `detached` began: its own tree, and every process of the journey outside the ones already running, which covers the servers and watchers a tool starts in sessions of their own. */
function leftover(context: JourneyContext, detached: Detached): number[] {
  const earlier = new Set(withDescendants(detached.before));
  return withDescendants([detached.pid, ...journeyProcesses(context)]).filter(
    (pid) => !earlier.has(pid) && pid !== process.pid && running(pid),
  );
}

async function waitUntilGone(
  context: JourneyContext,
  detached: Detached,
  ms: number,
): Promise<void> {
  for (
    let waited = 0;
    waited < ms && leftover(context, detached).length > 0;
    waited += POLL_MS
  )
    await sleep(POLL_MS);
}

/**
 * Sends Ctrl+C (SIGINT) to the process group, then terminates and kills every process the command started,
 * including the ones in sessions of their own, records the log and checks that nothing of the journey is left.
 */
export async function stopDetached(
  context: JourneyContext,
  detached: Detached,
  name: string,
): Promise<void> {
  await context.command(`stop ${name}`, "kill", [
    "-INT",
    "--",
    `-${detached.pid}`,
  ]);
  for (
    let waited = 0;
    waited < STOP_MS && running(detached.pid);
    waited += POLL_MS
  )
    await sleep(POLL_MS);
  for (const signal of ["TERM", "KILL"]) {
    const pids = leftover(context, detached);
    if (pids.length === 0) break;
    await context.command(`${signal} what is left of ${name}`, "kill", [
      `-${signal}`,
      ...pids.map(String),
    ]);
    await waitUntilGone(context, detached, SIGNAL_MS);
  }
  const log = await context.command(`the log of ${name}`, "cat", [
    detached.log,
  ]);
  context.expect(log.step, [
    equal(
      `no process the journey started with ${name} is left`,
      leftover(context, detached),
      [],
    ),
  ]);
}
