---
covers:
docs:
  - README.md
journeys:
  - scaffold-dev
  - scaffold-checks
---

# Smoke

The fixed journeys every verdict runs, whatever the diff touches: create the project with `ajs project init` from the offline manifest, install it, start it against the run's MongoDB until it prints the onboarding address, stop it, and run its own checks.

## Sub-features

- `scaffold-dev`: `ajs project init --template "DMS Demo"`, `pnpm install --frozen-lockfile`, `ajs project dev --watch` (what `pnpm dev` runs) with `MONGODB_URL` pointing at the run's MongoDB, until the log prints `[DMS] No owner exists yet. To create it, open http://localhost:3001/onboarding?token=...` and the process still runs 3 s later; the API answers `/api/system-state`; Ctrl+C exits 130 and the API port then refuses.
- `scaffold-checks`: the pack's journey: the same scaffold and install, then the project's own `pnpm run checks` (typecheck, lint, format, knip, the backend's node tests and the frontend-vue Vitest suite, size, suppressions and sync).

## How to get to it (user POV)

- `npx @antelopejs/core project init my-app --template dms-demo --yes`, `cd my-app`, `pnpm dev`, then open the onboarding address the log prints.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" smoke
```

## Gotchas

- The smoke feature covers no glob, so it never marks a file as mapped.
- Every journey that needs a scaffolded project, the repository's and the pack's, takes a copy of one build per run under the `scaffolded` key of `context.prepared`. The first journey to ask builds it, and its `prepared scaffolded` step holds the init and install evidence; every later journey's `prepared scaffolded` step names that journey. A journey that needs a fresh init or install of its own must not use `scaffolded()`.
- `scaffold-dev` is the repository's own journey under the pack's id: the pack's journey starts `ajs project dev` with only `PORT` set, and the DMS cannot construct its modules without a MongoDB (`connect ECONNREFUSED`), while `verify.config.ts` `env` is static and cannot carry the run's MongoDB port. It runs the pack's steps and adds `MONGODB_URL`, the variable the README tells the user to set for a non-default instance.
- The probe is the onboarding line, which the DMS prints at every start while no owner exists. A journey that starts the backend again after creating the owner would never see it, so the journeys create the owner last.
- `scaffold-checks` fails at `sync:check` with `@antelopejs/core` 1.20.0 and `@antelopejs/tooling-configs` 0.2.18: `ajs project init` leaves `.agents/` and `.claude/skills/` out of every scaffold (`SCAFFOLD_EXCLUDED_PATHS`), and `antelopejs-sync --check --profile template` then reports the synced skill files as drift. The other checks pass. The fix belongs to one of those two packages, not to this template.
