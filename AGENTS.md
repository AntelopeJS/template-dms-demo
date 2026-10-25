# AntelopeJS DMS project

This project is built on the AntelopeJS DMS (dashboard management system). The
deep, product-specific guidance is NOT in this repo: it ships as skills inside
the DMS packages themselves.

Bootstrap: see Getting started in `README.md` (`pnpm install`, then
`pnpm exec ajs project modules install`, then `pnpm dev`).

The skills reach the project through a sync from its installed packages: the
DMS skills from `@antelopejs/dms` once `pnpm install` has run, and the `dms-*`
modules' skills once `pnpm dev` has downloaded them into `.antelope/cache`.
Claude Code reads them from `.claude/skills/`, Codex from `.agents/skills/`.
When they seem missing:

- Claude Code: run `/antelopejs:sync-skills`; `/antelopejs:skills` lists what
  is synced. The antelopejs plugin syncs on session start and after installs,
  and `.claude/settings.json` offers to install it when you trust this folder.
- Codex: run `npx -y github:AntelopeJS/agent-skills sync --target codex` from
  the project root (`list` instead of `sync` shows what is synced), then
  restart Codex if a skill does not appear.

Start with the `dms` skill for the mental model and its routing, and follow
`dms-best-practices` when building pages and blocks. `dms-project` runs the
dev servers, and `dms-frontend` covers the `ajs dms` CLI.

The backend lives in `src/` and the Vue frontend module in `frontend-vue/`,
which is a separate package with its own ESLint, Prettier and Vitest setup —
run its checks with `pnpm --dir frontend-vue lint` and `pnpm --dir frontend-vue
test`, not with the root oxlint/oxfmt.

## Checks

- `pnpm run checks` runs typecheck, lint, format, knip, `pnpm test`, size,
  ratchet and sync, and prints only what failed. `pnpm lint` runs oxlint on
  the backend and ESLint on `frontend-vue`; `pnpm test` runs only the
  `frontend-vue` Vitest suite. The backend has no tests.
- `checks` does not run `pnpm build` (CI runs it after `checks`),
  `pnpm frontend:verify` (builds and type-checks `frontend-vue` against the
  installed `@antelopejs/dms` and `@antelopejs/dms-frontend`) or
  `pnpm knip:all` (also reports dead files and exports; confirm each finding
  before you remove code) or
  `pnpm --dir frontend-vue exec prettier --check . '!pnpm-lock.yaml'` (oxfmt ignores
  `frontend-vue`). Run them when your change touches what they cover.
- `guardrails.ratchet.json` records the lint findings the template already had.
  Its numbers only go down: after you remove debt, run
  `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for
  `oxlint`; the ratchet counts it instead, and the pre-commit hook rejects it
  on every line you add.
- lefthook runs oxfmt, oxlint, the size check and the ratchet on staged files
  before each commit, and `typecheck` before each push. `ajs project init`
  installs dependencies before it runs `git init`, so a project created from
  this template starts without hooks: run `pnpm exec lefthook install` once
  after `git init`. In a new repository the first commit adds every template
  line, which the ratchet reads as new findings, so make that one commit with
  `LEFTHOOK=0 git commit`.
- The ratchet hook skips `frontend-vue/`: oxlint ignores it, and the ratchet
  fails on a commit whose files oxlint ignores entirely.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Lint with `oxlint` and format with `oxfmt`; both read the configs at the repository root. Fix every finding: no rule warns.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |

<!-- antelopejs-guardrails:end -->
