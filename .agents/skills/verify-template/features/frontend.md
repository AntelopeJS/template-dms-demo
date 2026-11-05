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
- `dashboard-dev`: with the backend running, `pnpm frontend:dev` on a free `PORT` discovers it through `.antelope/dev.json`, answers the onboarding address the backend printed with an HTML page, and proxies `/api/system-state` to the backend it discovered; after the stop no process of the journey is left and the port answers nothing.

## How to get to it (user POV)

- `pnpm dev`, then `pnpm frontend:dev` in a second terminal, then the onboarding address.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" frontend
```

## Gotchas

- `dashboard-dev` starts `pnpm frontend:dev` with `setsid` in its own process group, sends it Ctrl+C when the journey ends, failed or not, then terminates and kills every process of the journey started since: `ajs dms dev` runs `server.mjs` and the e-mail bundle watcher in sessions of their own, which Ctrl+C on the group never reaches. Those are found by their parents and by their working directory or `HOME` under the journey's folders. The harness does not track them, so `clean` cannot stop them if the journey process itself is killed; look for them with `pgrep -af <run>/homes`.
- The loader installs the generated workspace's dependencies at its first start, so `dashboard-dev` waits up to four minutes for the first answer.
