// Release gate for the template's environment surface.
//
// A newcomer only ever sees `.env.example` and the README table; the backend
// only ever sees the `envOverrides` block of `antelope.config.ts`. When those
// three drift apart, a required variable silently disappears from the path a
// newcomer follows — which is exactly how DMS_SESSION_SECRET went missing.
//
// This script asserts that the three lists agree.
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), "utf8");
}

/**
 * Variable names declared in `.env.example`, including the ones commented out:
 * a commented `#NAME=value` line still documents the variable, it just leaves
 * it unset by default.
 */
function envExampleNames() {
  const names = new Set();
  for (const line of read(".env.example").split("\n")) {
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

/** Variable names mapped onto module config paths by `antelope.config.ts`. */
function envOverrideNames() {
  const source = read("antelope.config.ts");
  const block = /envOverrides:\s*\{([\s\S]*?)\n  \},/.exec(source);
  if (!block) throw new Error("No envOverrides block in antelope.config.ts");
  const names = new Set();
  for (const line of block[1].split("\n")) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*:/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

/** Variable names listed in the README table between its env-table markers. */
function readmeNames() {
  const readme = read("README.md");
  const table = /<!-- env-table:start -->([\s\S]*?)<!-- env-table:end -->/.exec(
    readme,
  );
  if (!table) throw new Error("No <!-- env-table:start --> block in README.md");
  const names = new Set();
  for (const line of table[1].split("\n")) {
    const match = /^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/.exec(line);
    if (match) names.add(match[1]);
  }
  if (names.size === 0) throw new Error("The README env table lists nothing");
  return names;
}

function missing(expected, actual) {
  return [...expected]
    .filter((name) => !actual.has(name))
    .sort((left, right) => left.localeCompare(right));
}

const envExample = envExampleNames();
const readme = readmeNames();
const overrides = envOverrideNames();

const problems = [
  {
    names: missing(readme, envExample),
    reason: "documented in README.md but absent from .env.example",
  },
  {
    names: missing(envExample, readme),
    reason: "declared in .env.example but absent from the README env table",
  },
  {
    names: missing(overrides, envExample),
    reason: "mapped by envOverrides but absent from .env.example",
  },
  {
    names: missing(overrides, readme),
    reason: "mapped by envOverrides but absent from the README env table",
  },
].filter((problem) => problem.names.length > 0);

if (problems.length > 0) {
  for (const problem of problems)
    console.error(`${problem.reason}: ${problem.names.join(", ")}`);
  console.error(
    "Update .env.example, the README env table and antelope.config.ts together.",
  );
  process.exit(1);
}

console.log(
  `Environment surface consistent: ${envExample.size} variables in .env.example, the README table and envOverrides.`,
);
