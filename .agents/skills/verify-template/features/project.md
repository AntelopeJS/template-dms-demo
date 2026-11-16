---
covers:
  - antelope.config.ts
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - .npmrc
  - .nvmrc
  - frontend.Dockerfile
  - .cicd/**
docs:
  - README.md
journeys:
  - onboarding
  - database-mapping
  - production-env
  - frontend-image
  - locked-build
---

# Project

The project configuration every scaffolded project keeps: the modules and environment mapping of `antelope.config.ts`, the scripts and dependencies, the workspace and the dashboard image.

## Sub-features

- `onboarding`: the first start prints the onboarding address on `http://localhost:3001`, the README's dashboard origin; the instance is not onboarded; the wizard refuses a wrong setup token (403), a password without a capital or a special character and one whose special character is `#` (400), and none of them creates a user; the printed token creates the owner, a second owner is a 400, the owner's token opens `/api/auth/me`, a wrong password is a 401, and MongoDB holds one owner without the password in clear.
- `database-mapping`: with only `MONGODB_URL` set, the start creates `template_dms_demo` and no other database, and the DMS users and Helio customers are in it; with `MONGODB_DATABASE=verify_mapped`, the next start creates that database with the same collections and leaves the default one as it was. The default and the configured database both hold the plans Helio's first write provisioned: four public ones and the hidden `helio-hq`.
- `production-env`: on a free API port, `ajs project build -e production` then `ajs project start -e production` fail and name `JWT_SECRET`, `DMS_HTML_RENDER_SECRET` or `DMS_CLIENT_BASE_URL` in the DMS's error when that one is unset; with all three (and `DMS_API_PUBLIC_BASE_URL` and `SMTP_HOST`) the backend starts, prints the onboarding address on the `DMS_CLIENT_BASE_URL` origin, a token signed with `JWT_SECRET` opens `/api/auth/me`, and the log does not print the secret.
- `locked-build`: in a clean `git clone` of the committed project, `ajs project build -e production` with an empty module cache installs exactly the module versions of the committed `antelope-lock/` (the module cache's manifest lists each `<package>@<version>` of a lock folder, no more and no fewer), and, with `ANTELOPEJS_FROZEN_MODULES=1` (what AntelopeJS Cloud sets for a project that commits its locks, `--frozen-modules` on the command line), fails naming the module when the commit drops that module's lock; without it, `ajs` records a lock for a module that has none and the build passes. The journey fails when the project commits no `antelope-lock/` at all.
- `frontend-image`: `docker build -f frontend.Dockerfile .` in a clean `git clone` of the committed project builds; the image runs `/app/node_modules/.bin/ajs-dms start` as `node`, and without its environment that command exits non-zero naming `DMS_API_BASE_URL`.

## How to get to it (user POV)

- `pnpm dev` and the onboarding address; `.env` with the variables of the README's Environment table; `ajs project build -e production` and `frontend.Dockerfile` for a deployment.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" project
```

## Gotchas

- `frontend-image` needs Docker and network access inside the build (corepack fetches pnpm, pnpm fetches the packages); without a Docker daemon the journey is NOT VERIFIED. It stores the image's layers uncompressed, since the image is never pushed: gzip took about half of the image export. It removes the image it built.
- `production-env` sets `SMTP_HOST=127.0.0.1`: with `-e production`, nodemailer sends through `SMTP_HOST` instead of Ethereal.
- The DMS refuses missing production secrets only outside development: `ajs project dev -e production` starts without them. The journey therefore builds and starts, as a deployment does.
- `locked-build` builds with the five production variables of `production-env` and needs network access for the registry, like every build; the build it runs installs every module, so it is the slowest journey of the feature after `frontend-image`.
- `ajs project build` freezes the values `envOverrides` reads, secrets included, into `.antelope/build/build.json`, and `ajs project start` without `--refresh-config` ignores its own environment, so the journey builds once per environment it starts.
- `ajs project start` does not fall back to the next free port as `pnpm dev` does, so the journey edits the scaffolded `antelope.config.ts` to listen on a free port, and starts the backend with `setsid` in its own process group, stopped with Ctrl+C when the journey ends.
