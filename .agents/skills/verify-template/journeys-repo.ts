import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  equal,
  exitIs,
  has,
  type Journey,
  type JourneyContext,
} from "@antelopejs/tooling-configs/verify";

import { keys, parseJson, pick } from "./json.ts";
import { scaffolded, startBackend } from "./project.ts";

const NOT_SCRIPTS = ["install", "add", "exec", "dlx"];
const DOCUMENTED = [
  "dev",
  "frontend:dev",
  "frontend:build",
  "frontend:verify",
  "checks",
  "capture:start",
];
const READ_IN_SOURCE = ["HELIO_NOW", "HELIO_SIMULATORS"];

const lintRejects: Journey = {
  title:
    "the scaffolded project's lint rejects a `debugger` statement, its typecheck a wrongly typed value and its format check an unformatted file, so the configs it inherits are live",
  entryPoint:
    "`pnpm run lint`, `pnpm run typecheck` and `pnpm run format:check` after adding `src/verify-broken.ts`",
  async run(context) {
    const project = await scaffolded(context);
    const file = join(project, "src", "verify-broken.ts");
    context.edit(
      "add a debugger statement",
      file,
      "debugger;\nexport const broken = 1;\n",
    );
    const lint = await context.command(
      "pnpm run lint",
      "pnpm",
      ["run", "lint"],
      { cwd: project },
    );
    context.edit(
      "replace it with a type error",
      file,
      'export const broken: number = "text";\n',
    );
    const typecheck = await context.command(
      "pnpm run typecheck",
      "pnpm",
      ["run", "typecheck"],
      { cwd: project },
    );
    context.edit(
      "replace it with an unformatted file",
      file,
      "export const broken = {a:1}\n",
    );
    const format = await context.command(
      "pnpm run format:check",
      "pnpm",
      ["run", "format:check"],
      { cwd: project },
    );
    context.expect(format.folder, [
      equal("lint fails", lint.exitCode !== 0 && lint.exitCode !== null, true),
      has("and names the debugger rule", lint.stdout + lint.stderr, /debugger/),
      equal(
        "typecheck fails",
        typecheck.exitCode !== 0 && typecheck.exitCode !== null,
        true,
      ),
      has(
        "and names the type error",
        typecheck.stdout + typecheck.stderr,
        /not assignable to type 'number'/,
      ),
      equal(
        "the format check fails",
        format.exitCode !== 0 && format.exitCode !== null,
        true,
      ),
      has(
        "and names the file",
        format.stdout + format.stderr,
        /verify-broken\.ts/,
      ),
    ]);
  },
};

/** Every `pnpm <script>` a page names as a command, in a code span or a code block line, the package manager's own commands left out. */
function namedScripts(page: string): string[] {
  const named = [...page.matchAll(/(?:^|`)pnpm (?:run )?([a-z][\w:-]*)/gm)].map(
    (match) => match[1] ?? "",
  );
  return [...new Set(named)]
    .filter((name) => !NOT_SCRIPTS.includes(name))
    .sort();
}

/** The variables of the README's Environment table that the backend reads. */
function backendVariables(readme: string): string[] {
  const rows = [...readme.matchAll(/^\| (.+?) \| ([a-z +]+) \|/gm)].filter(
    (row) => (row[2] ?? "").includes("backend"),
  );
  return rows
    .flatMap((row) =>
      [...(row[1] ?? "").matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map(
        (match) => match[1] ?? "",
      ),
    )
    .sort();
}

/** The variables the `envOverrides` block of `antelope.config.ts` maps. */
function overriddenVariables(config: string): string[] {
  const block = /envOverrides: \{([\s\S]*?)\n {2}\},/.exec(config)?.[1] ?? "";
  return [...block.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm)]
    .map((match) => match[1] ?? "")
    .sort();
}

function dmsPackages(text: string, pattern: RegExp): string[] {
  return [
    ...new Set([...text.matchAll(pattern)].map((match) => match[1] ?? "")),
  ].sort();
}

function read(project: string, file: string): string {
  return readFileSync(join(project, file), "utf8");
}

const docsClaims: Journey = {
  title:
    "what README.md and AGENTS.md claim holds in the scaffolded project: every `pnpm` command they name is a script, `pnpm dev` runs what the README says, the Environment table lists exactly what `envOverrides` maps, and the module table, default database and ports are the ones `antelope.config.ts` sets",
  entryPoint:
    'reading README.md and AGENTS.md of a project created with `ajs project init --template "DMS Demo"`',
  async run(context) {
    const project = await scaffolded(context);
    const readme = read(project, "README.md");
    const agents = read(project, "AGENTS.md");
    const config = read(project, "antelope.config.ts");
    const scripts = pick(parseJson(read(project, "package.json")), "scripts");
    const defined = keys(scripts);
    const named = namedScripts(`${readme}\n${agents}`);
    const documented = backendVariables(readme);
    const mapped = overriddenVariables(config);
    const sources = await context.command(
      "the variables the sources read",
      "grep",
      ["-rhoE", "process\\.env\\.HELIO_[A-Z_]+", "src"],
      { cwd: project },
    );
    context.expect(context.tree("project files", project).folder, [
      equal(
        "README and AGENTS commands without a script",
        named.filter((name) => !defined.includes(name)),
        [],
      ),
      equal(
        "the README names the documented scripts",
        DOCUMENTED.filter((name) => !named.includes(name)),
        [],
      ),
      equal(
        "`pnpm dev` runs what the README says",
        pick(scripts, "dev") ?? null,
        /`pnpm dev` runs `([^`]+)`/.exec(readme)?.[1] ?? "",
      ),
      equal(
        "backend variables the README lists that envOverrides does not map",
        documented.filter((name) => !mapped.includes(name)),
        READ_IN_SOURCE,
      ),
      equal(
        "variables envOverrides maps that the README does not list",
        mapped.filter((name) => !documented.includes(name)),
        [],
      ),
      equal(
        "the sources read the variables envOverrides does not map",
        READ_IN_SOURCE.filter(
          (name) => !sources.stdout.includes(`process.env.${name}`),
        ),
        [],
      ),
      equal(
        "the README's module table is the DMS modules antelope.config.ts loads",
        dmsPackages(readme, /^\| [^|]+\| `(@antelopejs\/dms[\w-]*)`/gm),
        dmsPackages(config, /"(@antelopejs\/dms[\w-]*)"/g),
      ),
      has(
        "the default database the README names",
        config,
        /database: "template_dms_demo"/,
      ),
      has("the API port the README names", config, /port: 5010\b/),
      has("the README's backend address", readme, /http:\/\/localhost:5010/),
      has("the README's dashboard address", readme, /http:\/\/localhost:3001/),
    ]);
  },
};

async function ignored(
  context: JourneyContext,
  project: string,
  path: string,
): Promise<number | null> {
  const check = await context.command(
    `git check-ignore ${path}`,
    "git",
    ["check-ignore", "-q", path],
    { cwd: project },
  );
  return check.exitCode;
}

const IGNORED = [
  ".env",
  "node_modules/x",
  "frontend-vue/node_modules/x",
  "dist/index.js",
  ".antelope/dev.json",
  ".dms-frontend/x",
  "debug.log",
  ".claude/scheduled_tasks.lock",
];
const LEAKS_SHOWN = 10;
const KEPT = [
  "antelope-lock/x",
  "src/index.ts",
  "antelope.config.ts",
  "pnpm-lock.yaml",
  "frontend-vue/pnpm-lock.yaml",
  "frontend-vue/dms.frontend.ts",
  "content/home/why.en-GB.md",
];

const gitignore: Journey = {
  title:
    "after install, `pnpm dev` and a `.env`, git ignores the secrets, dependencies, build output and runtime state of the project, and keeps its sources and the module locks `ajs` asks to commit",
  entryPoint:
    "`git status` and `git check-ignore` in a scaffolded project after `pnpm dev` ran",
  async run(context) {
    const project = await scaffolded(context);
    const backend = await startBackend(context, project, {
      env: { HELIO_SIMULATORS: "off" },
    });
    await context.stop("Ctrl+C", backend.app);
    context.edit("create a .env", join(project, ".env"), "JWT_SECRET=verify\n");
    const results: [string, number | null][] = [];
    for (const path of [...IGNORED, ...KEPT])
      results.push([path, await ignored(context, project, path)]);
    const others = await context.command(
      "untracked files",
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd: project },
    );
    const leaked = others.stdout
      .split("\n")
      .filter((path) =>
        /(^|\/)(node_modules|dist|\.antelope|\.dms-frontend)\/|^\.env$/.test(
          path,
        ),
      )
      .slice(0, LEAKS_SHOWN);
    context.expect(others.folder, [
      exitIs(others, 0),
      equal(
        "paths git does not ignore",
        results
          .filter(([path, code]) => IGNORED.includes(path) && code !== 0)
          .map(([path]) => path),
        [],
      ),
      equal(
        "paths git ignores",
        results
          .filter(([path, code]) => KEPT.includes(path) && code !== 1)
          .map(([path]) => path),
        [],
      ),
      equal(
        "secrets, dependencies and build output left untracked, the first ones",
        leaked,
        [],
      ),
      has(
        "the module locks are untracked, to commit",
        others.stdout,
        /^antelope-lock\//m,
      ),
    ]);
  },
};

export const repoJourneys = {
  "lint-rejects": lintRejects,
  "docs-claims": docsClaims,
  gitignore,
};
