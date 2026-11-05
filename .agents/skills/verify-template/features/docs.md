---
covers:
  - README.md
  - AGENTS.md
  - CLAUDE.md
  - CONTRIBUTING.md
  - LICENSE
docs:
  - README.md
  - AGENTS.md
journeys:
  - docs-claims
---

# Docs

The pages the user and their coding agent read first.

## Sub-features

- `docs-claims`: in the scaffolded project, every `pnpm <script>` README.md and AGENTS.md name is a script and the README names `dev`, `frontend:dev`, `frontend:build`, `frontend:verify`, `checks` and `capture:start`; `pnpm dev` runs the command the README says; the backend variables of the README's Environment table are exactly the `envOverrides` keys of `antelope.config.ts` plus `HELIO_NOW` and `HELIO_SIMULATORS`, which the sources read themselves; the README's module table lists the `@antelopejs/dms*` modules `antelope.config.ts` loads; the default database `template_dms_demo` and the ports 5010 and 3001 are the configured ones.

## How to get to it (user POV)

- Opening README.md of a scaffolded project.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" docs
```

## Gotchas

- What the pages say about running the project is judged against the evidence of the other features: the onboarding line and address (`project/onboarding`), the password policy (`project/onboarding`), the `-e production` requirements (`project/production-env`) and the dashboard (`frontend/dashboard-dev`).
