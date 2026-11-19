import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The name the offline interfaces manifest lists the template under, as the public manifest does. */
export const TEMPLATE = "DMS Demo";

/** The repository the tests scaffold from: its working tree, uncommitted changes included. */
export const REPO = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const MONGO_IMAGE = "mongo:8.0";
const MONGO_READY_ATTEMPTS = 120;
const MONGO_POLL_MS = 500;
const GIT_IDENTITY = [
  "-c",
  "user.name=template tests",
  "-c",
  "user.email=template-tests@antelopejs.invalid",
  "-c",
  "init.defaultBranch=main",
  "-c",
  "commit.gpgsign=false",
];

/** What every journey of one `node --test` process shares: its scratch root, the offline template source and one MongoDB container. */
export interface Run {
  dir: string;
  manifestUrl: string;
  mongoContainer: string;
  mongoUrl: string;
  /** The folders `prepared` kept, by key. */
  prepared: Map<string, string>;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", [...GIT_IDENTITY, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function commitFolder(folder: string): void {
  git(folder, ["init", "-q"]);
  git(folder, ["add", "-A", "--force"]);
  git(folder, ["commit", "-q", "-m", "template source"]);
}

function bare(source: string, target: string): string {
  git(dirname(source), ["clone", "-q", "--bare", source, target]);
  return pathToFileURL(target).href;
}

function copyWorkingTree(target: string): void {
  const files = git(REPO, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]).split("\0");
  for (const file of new Set(files.filter(Boolean))) {
    const source = join(REPO, file);
    const stat = lstatSync(source, { throwIfNoEntry: false });
    if (stat === undefined) continue;
    mkdirSync(dirname(join(target, file)), { recursive: true });
    if (stat.isSymbolicLink())
      symlinkSync(readlinkSync(source), join(target, file));
    else copyFileSync(source, join(target, file));
  }
}

/** The template's working tree as a local git repository, listed under `projectTemplates` by an interfaces manifest `ajs config set git` can point at. */
function seedSources(dir: string): string {
  const template = join(dir, "sources", "template");
  mkdirSync(template, { recursive: true });
  copyWorkingTree(template);
  commitFolder(template);
  const manifest = join(dir, "sources", "interfaces");
  mkdirSync(manifest, { recursive: true });
  const listing = {
    interfaces: {},
    starredInterfaces: [],
    templates: [],
    projectTemplates: [
      {
        name: TEMPLATE,
        repository: bare(template, join(dir, "sources", "template.git")),
        branch: "main",
        packageManager: "pnpm",
      },
    ],
  };
  writeFileSync(
    join(manifest, "manifest.json"),
    `${JSON.stringify(listing, null, 2)}\n`,
  );
  commitFolder(manifest);
  return bare(manifest, join(dir, "sources", "interfaces.git"));
}

function docker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function mongoAnswers(container: string): boolean {
  try {
    return (
      docker([
        "exec",
        container,
        "mongosh",
        "--quiet",
        "--eval",
        "db.adminCommand('ping').ok",
      ]) === "1"
    );
  } catch {
    return false;
  }
}

async function startMongo(container: string): Promise<string> {
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    container,
    "--ulimit",
    "nofile=64000:64000",
    "-p",
    "127.0.0.1::27017",
    MONGO_IMAGE,
  ]);
  for (
    let attempt = 0;
    attempt < MONGO_READY_ATTEMPTS && !mongoAnswers(container);
    attempt += 1
  )
    await new Promise((done) => setTimeout(done, MONGO_POLL_MS));
  if (!mongoAnswers(container))
    throw new Error(`${MONGO_IMAGE} did not answer a ping in ${container}`);
  const published = docker(["port", container, "27017/tcp"]).split("\n")[0];
  return `mongodb://${published}`;
}

/** The pnpm store and npm cache the journeys share across their own HOMEs, outside every run so a later run reuses them. */
export const SHARED_CACHE = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "template-dms-demo-tests",
);

/** The `ajs` bin of the repository's `@antelopejs/core`; it `exec`s node, so its PID is the CLI's. */
export const AJS = join(REPO, "node_modules", ".bin", "ajs");

const dir = mkdtempSync(join(tmpdir(), "template-dms-demo-tests-"));
const mongoContainer = `template-dms-demo-tests-${process.pid}`;
let started: Promise<Run> | undefined;

after(() => {
  if (started !== undefined)
    execFileSync("docker", ["rm", "-f", mongoContainer], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
});

/** The run of this process, started by the first journey; its folder and container go once every test ended. */
export function currentRun(): Promise<Run> {
  started ??= (async () => ({
    dir,
    manifestUrl: seedSources(dir),
    mongoContainer,
    mongoUrl: await startMongo(mongoContainer),
    prepared: new Map(),
  }))();
  return started;
}
