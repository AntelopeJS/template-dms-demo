---
name: verify-template-dms-demo
description: Check a change to the template-dms-demo repo before pushing it. Gives the scoped command for each kind of change (backend, frontend-vue, locales, the template journeys, workflows, synced files, dependencies) and names what CI and the merge queue run instead. Use before you commit or push here.
---

# Verify a template-dms-demo change

CI and the merge queue run everything. You run the scoped command for each kind of change your diff touches, then read CI's result on the pull request. This repo is a DMS template: CI drives the app through the template journeys, so no step here launches or clicks through it.

## Setup

Once per checkout: Node from `.nvmrc` (24), pnpm from `packageManager` through corepack, then:

```sh
pnpm install --frozen-lockfile
pnpm --dir frontend-vue run types
```

`types` writes `frontend-vue/.dms-types`. The frontend typecheck, ESLint and the root `oxlint` read it, and `oxlint` fails on `frontend-vue/tsconfig.json` until it exists.

## What to run for your change

| Change | Command |
| --- | --- |
| Backend source or test in `src/` | `pnpm run build && node --test --test-concurrency=4 dist/<path>.test.js`, the compiled test next to the file you changed; then `pnpm run typecheck` |
| Frontend in `frontend-vue/app/` or `frontend-vue/tests/` | `pnpm --dir frontend-vue exec vitest run tests/<file>.test.ts --maxWorkers=4`, `pnpm --dir frontend-vue run typecheck`, `pnpm --dir frontend-vue exec eslint <path relative to frontend-vue>` |
| Locales in `frontend-vue/i18n/`, or a backend string a page shows | `pnpm --dir frontend-vue exec node scripts/check-locales.ts` |
| Any TypeScript or Vue file | `pnpm exec oxlint <files>` and `pnpm exec oxfmt --check <files>` |
| Template journeys or harness in `.github/scripts/template/` | `pnpm exec tsc -p .github/scripts/template`; for `shards.mts`, `node --test .github/scripts/template/shards.test.mts`; for a journey, run that one journey as in Services |
| `antelope.config.ts`, `antelope-lock/` | the `deploy › locked-build` journey: `node --test --test-isolation=none --test-name-pattern=locked-build .github/scripts/template/deploy.test.mts` |
| `README.md` or `docs/` | the `docs › docs-claims` journey: `node --test --test-isolation=none --test-name-pattern=docs-claims .github/scripts/template/docs.test.mts` |
| `ci.yml`, `AGENTS.md` Guardrails, `oxlint.config.ts`, `oxfmt.config.ts`, `guardrails.suppressions.json` | `pnpm run sync:check`. These are written by `@antelopejs/tooling-configs`: run `pnpm run sync`, never edit them by hand |
| Other workflows (`next-canary.yml`, `module-locks.yml`) | `pnpm exec oxfmt --check <file>`; CI runs the workflow itself |
| `package.json`, `pnpm-lock.yaml`, an import | `pnpm run knip` |
| A new journey | add its recorded seconds to `JOURNEY_SECONDS` in `shards.mts`, then `node --test .github/scripts/template/shards.test.mts` |

`pnpm run checks`, `pnpm test` and `pnpm build` run whole suites: leave them to CI.

## Services

The backend tests and the frontend Vitest suite need none. Each template journey starts its own `mongo:8.0` container through Docker and removes it when it ends, so it needs only a running Docker daemon (`docker ps`). Run one journey by its id:

```sh
pnpm exec tsc -p .github/scripts/template
node --test --test-isolation=none --test-name-pattern=<id> .github/scripts/template/<feature>.test.mts
```

The ids and their recorded seconds are the keys of `JOURNEY_SECONDS` in `.github/scripts/template/shards.mts`, keyed `<feature> › <id>`; the seconds say how long each takes on a CI runner.

## Left to CI

Read these jobs' results on the pull request. Rerun only the scoped command of a failing one to reproduce it.

- `ci / checks` (`.github/workflows/ci.yml`, shared `ci-node.yml@v2`): `pnpm run checks` (typecheck, lint, format, knip, tests, size, ratchet, suppressions, sync) on every tier, `pnpm test` in its Test job, and `pnpm build` with the harness typecheck in the Extra jobs.
- `ci / Extra .nvmrc 1/4` to `4/4`: every template journey, split by recorded time, on the full tier, in the merge queue and nightly. A pull request whose files all sit in subfolders or are Markdown runs the fast tier, which skips the journeys. The merge queue always runs them.
- Windows legs: the nightly run of `ci.yml`.
- `verdict`: fails when `ci`, `renovate-sync` or `module-locks` failed.
- `next canary` (`.github/workflows/next-canary.yml`): nightly, the demo on every `@antelopejs` `next` preview, then the smoke journeys.
- `module locks` (`.github/workflows/module-locks.yml`): hourly, opens the lock refresh pull request.

## Done

The change is checked when every row its diff touches passed, with the command and its output shown in your report. A row you could not run, such as a journey without Docker, says why.
