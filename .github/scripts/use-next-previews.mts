import { execFile } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Points every `@antelopejs` dependency of `package.json` and every module source of `antelope.config.ts` at the
 * exact version of its npm `next` dist-tag, and appends to `$GITHUB_STEP_SUMMARY` a table of what each package runs
 * on. A package keeps its stable range when it has no `next` tag, or when its `next` is not ahead of `latest`, as when
 * the repository's `next` branch has not merged its last release yet, or when npm cannot resolve the preview's
 * dependency tree, as when it was published with a `workspace:` specifier. An `interface-*` package always keeps its
 * stable range: core shares one copy of each interface between modules and checks it against every module's range
 * without prereleases, so a preview copy stops the demo from booting. `package.json` gets the previews as
 * `pnpm.overrides`, so its own ranges stay and every copy in the tree, transitive ones included, loads the preview.
 */

type Choice =
  | { readonly kind: "preview"; readonly version: string }
  | { readonly kind: "stable"; readonly reason: string };

/** Package names to versions or ranges, as in `dependencies`, `pnpm.overrides` and the registry's dist-tags. */
type Versions = { readonly [name: string]: string };

interface PnpmSettings {
  readonly overrides?: Versions;
}

interface Manifest {
  readonly dependencies?: Versions;
  readonly devDependencies?: Versions;
  readonly pnpm?: PnpmSettings;
}

const PACKAGE_JSON = "package.json";
const ANTELOPE_CONFIG = "antelope.config.ts";
const INTERFACE_PREFIX = "@antelopejs/interface-";
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies"] as const;
/**
 * `"@antelopejs/<name>"`, then `, "<range>"` or `, version: "<range>"`, with any block comments between: both module
 * source forms of the config.
 */
const MODULE_SOURCE =
  /"(@antelopejs\/[a-z0-9-]+)"(,\s*(?:\/\*[\s\S]*?\*\/\s*)*(?:version:\s*)?)"([^"]+)"/g;

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVersions(value: unknown): value is Versions {
  return isObject(value) && Object.values(value).every(isText);
}

function isPnpmSettings(value: unknown): value is PnpmSettings {
  return (
    isObject(value) && (!("overrides" in value) || isVersions(value.overrides))
  );
}

function isManifest(value: unknown): value is Manifest {
  return (
    isObject(value) &&
    (!("dependencies" in value) || isVersions(value.dependencies)) &&
    (!("devDependencies" in value) || isVersions(value.devDependencies)) &&
    (!("pnpm" in value) || isPnpmSettings(value.pnpm))
  );
}

function release(version: string): readonly number[] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`not a version: ${version}`);
  return match.slice(1).map(Number);
}

/** A prerelease of `X.Y.Z` sorts below `X.Y.Z`, so `next` is ahead of `latest` only when its release triple is higher. */
function isAhead(next: string, latest: string): boolean {
  const [a, b] = [release(next), release(latest)];
  const index = a.findIndex((part, i) => part !== b[i]);
  return index !== -1 && (a[index] ?? 0) > (b[index] ?? 0);
}

/** Why npm cannot resolve `name@version` and its dependency tree, or `undefined` when it can. */
async function installError(
  name: string,
  version: string,
): Promise<string | undefined> {
  const directory = mkdtempSync(join(tmpdir(), "next-canary-"));
  const logs = join(directory, "logs");
  try {
    await promisify(execFile)(
      "npm",
      [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        `--logs-dir=${logs}`,
        `${name}@${version}`,
      ],
      { cwd: directory },
    );
    return undefined;
  } catch {
    const errors = readdirSync(logs)
      .flatMap((file) => readFileSync(join(logs, file), "utf8").split("\n"))
      .flatMap((line) => /^\d+ error (.+)$/.exec(line)?.slice(1) ?? [])
      .filter((line) => !line.includes("complete log"));
    return (errors.join(" ") || "npm install failed").replaceAll("|", "\\|");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function choose(name: string): Promise<Choice> {
  const response = await fetch(
    `https://registry.npmjs.org/-/package/${name.replace("/", "%2f")}/dist-tags`,
  );
  if (!response.ok)
    throw new Error(`${name}: the registry answered ${response.status}`);
  const tags: unknown = await response.json();
  if (!isVersions(tags))
    throw new Error(
      `${name}: the registry's dist-tags are not name-to-version pairs`,
    );
  const { next, latest = "0.0.0" } = tags;
  if (next === undefined) return { kind: "stable", reason: "no `next` tag" };
  if (!isAhead(next, latest))
    return {
      kind: "stable",
      reason: `\`next\` ${next} is not ahead of \`latest\` ${latest}`,
    };
  if (name.startsWith(INTERFACE_PREFIX))
    return {
      kind: "stable",
      reason: `interface preview ${next} cannot load: core checks the shared copy against module ranges without prereleases`,
    };
  const error = await installError(name, next);
  if (error !== undefined)
    return {
      kind: "stable",
      reason: `preview ${next} not installable: ${error}`,
    };
  return { kind: "preview", version: next };
}

const manifest: unknown = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
if (!isManifest(manifest))
  throw new Error(
    `${PACKAGE_JSON} has a dependency field that is not name-to-range pairs`,
  );
const config = readFileSync(ANTELOPE_CONFIG, "utf8");

/** Each package and the stable ranges `package.json` and `antelope.config.ts` declare it with. */
const ranges = new Map<string, Set<string>>();
const declare = (name: string, range: string) =>
  ranges.set(name, (ranges.get(name) ?? new Set()).add(range));
for (const field of DEPENDENCY_FIELDS)
  for (const [name, range] of Object.entries(manifest[field] ?? {}))
    if (name.startsWith("@antelopejs/")) declare(name, range);
const sources = [...config.matchAll(MODULE_SOURCE)];
const unread = [...config.matchAll(/"(@antelopejs\/[a-z0-9-]+)"/g)].filter(
  ([, name]) => !sources.some((source) => source[1] === name),
);
if (unread.length > 0)
  throw new Error(
    `${ANTELOPE_CONFIG} names ${unread.map(([, name]) => name).join(", ")} without a version this script can read`,
  );
for (const [, name = "", , range = ""] of sources) declare(name, range);

const names = [...ranges.keys()].sort();
const choices = new Map(
  await Promise.all(
    names.map(async (name) => [name, await choose(name)] as const),
  ),
);
const previews = new Map(
  [...choices].flatMap(([name, choice]) =>
    choice.kind === "preview" ? [[name, choice.version] as const] : [],
  ),
);

const pnpm = {
  ...manifest.pnpm,
  overrides: { ...manifest.pnpm?.overrides, ...Object.fromEntries(previews) },
};
writeFileSync(
  PACKAGE_JSON,
  `${JSON.stringify({ ...manifest, pnpm }, null, 2)}\n`,
);
writeFileSync(
  ANTELOPE_CONFIG,
  config.replace(MODULE_SOURCE, (source, name: string, separator: string) => {
    const preview = previews.get(name);
    return preview === undefined ? source : `"${name}"${separator}"${preview}"`;
  }),
);

const rows = names.map((name) => {
  const choice = choices.get(name);
  const declared = [...(ranges.get(name) ?? [])]
    .map((range) => `\`${range}\``)
    .join(", ");
  return choice?.kind === "preview"
    ? `| \`${name}\` | \`${choice.version}\` | ${declared} | |`
    : `| \`${name}\` | stable | ${declared} | ${choice?.reason ?? ""} |`;
});
appendFileSync(
  process.env.GITHUB_STEP_SUMMARY ?? "/dev/stderr",
  [
    "## Preview versions",
    "",
    `${previews.size} of ${names.length} \`@antelopejs\` packages run on their \`next\` preview.`,
    "",
    "| Package | Runs on | Stable range | Kept stable because |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n"),
);
