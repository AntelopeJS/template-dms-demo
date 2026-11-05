---
covers:
  - frontend-vue/**
docs:
  - README.md
journeys:
  - frontend-checks
  - frontend-verify
  - dashboard-dev
---

# Frontend

The template's own frontend module in `frontend-vue/` (the home page's Vue components, the Markdown reader, the locale catalogs) and the dashboard the `ajs dms` loader serves from it.

## Sub-features

- `frontend-checks`: `pnpm --dir frontend-vue lint` (the locale key check and ESLint) and `pnpm --dir frontend-vue test` (Vitest) pass in the scaffolded project, and a failing test added under `frontend-vue/tests/` fails the suite and is named.
- `frontend-verify`: `pnpm frontend:verify` (`ajs dms verify-source`) builds and type-checks `frontend-vue` against the installed `@antelopejs/dms-frontend` and `@antelopejs/dms`.
- `dashboard-dev`: with the backend running, `pnpm frontend:dev` on a free `PORT` discovers it through `.antelope/dev.json`, answers the onboarding address the backend printed with an HTML page, and proxies `/api/system-state` to the backend it discovered.

## How to get to it (user POV)

- `pnpm dev`, then `pnpm frontend:dev` in a second terminal, then the onboarding address.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" frontend
```

## Gotchas

- `dashboard-dev` starts `pnpm frontend:dev` with `setsid` in its own process group and stops the group when the journey ends, failed or not; the harness does not track that process, so `clean` cannot stop it if the journey process itself is killed.
- The loader installs the generated workspace's dependencies at its first start, so `dashboard-dev` waits up to four minutes for the first answer.
