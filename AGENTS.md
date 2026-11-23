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
  ratchet, suppressions and sync, and prints only what failed. `pnpm lint`
  runs oxlint on the backend, then `frontend-vue/scripts/check-locales.ts`
  (locales share one key set and translate every key the backend writes) and
  ESLint on `frontend-vue`; `pnpm test` builds the backend and runs its
  `node --test` files (`pnpm run test:backend`), then the `frontend-vue`
  Vitest suite.
- `checks` does not run these; run them when your change touches what they
  cover:
  - `pnpm build`, which CI runs after `checks`.
  - `pnpm frontend:verify`, which builds and type-checks `frontend-vue`
    against the installed `@antelopejs/dms` and `@antelopejs/dms-frontend`.
  - `pnpm knip:all`, which also reports dead files and exports. Confirm each
    finding before you remove code.
  - `pnpm --dir frontend-vue exec prettier --check . '!pnpm-lock.yaml'`, since
    oxfmt ignores `frontend-vue`.
- `guardrails.suppressions.json` caps the lint directives, `@ts-expect-error`
  and `SAFETY:` comments; its numbers only go down. Fix the code rather than
  add a suppression.
- `guardrails.ratchet.json` records the lint findings the template already had.
  Its numbers only go down: after you remove debt, run
  `pnpm run ratchet:update` and commit the lowered file. A rule listed there is
  off for `oxlint`; the ratchet counts it instead, and `pnpm run checks` fails
  when a count rises.
- `pnpm run checks` needs a git repository. `ajs project init` creates one
  unless you pass `--no-git-init`; then run `git init` first.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Lint with `oxlint` and format with `oxfmt`; both read the configs at the repository root. Fix every finding: no rule warns.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

<!-- antelopejs-guardrails:end -->
