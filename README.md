# AntelopeJS DMS Demo Template

<div align="center">
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://dms.antelopejs.com/docs/getting-started/quickstart"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

A ready-to-run [AntelopeJS DMS](https://dms.antelopejs.com) project: every DMS
feature module, a catalog of the built-in components, and a small demo app,
translated in English and French.

- **Home**: an in-dashboard readme of what the template contains.
- **Components**: one page per built-in DMS component, each with its most
  complete example.
- **Demo app**: users, projects and tasks with relations, seeded through
  fixtures, and a kanban board for tasks.
- Every `dms-*` feature module installed from npm and configured in
  `antelope.config.ts`, ready to remove one by one.

## What you get

The DMS feature modules are all installed from npm (see
[`antelope.config.ts`](./antelope.config.ts)):

| Module        | Package                    |
| ------------- | -------------------------- |
| DMS core      | `@antelopejs/dms`          |
| API           | `@antelopejs/dms-api`      |
| Database      | `@antelopejs/dms-database` |
| Automation    | `@antelopejs/dms-automation` |
| SaaS          | `@antelopejs/dms-saas`     |
| AI            | `@antelopejs/dms-ai`       |
| Lang / i18n   | `@antelopejs/dms-lang`     |
| Builder       | `@antelopejs/dms-builder`  |
| Media library | `@antelopejs/dms-media`    |
| Marketing     | `@antelopejs/dms-marketing` |
| Mailing       | `@antelopejs/dms-mailing`  |

Supporting infrastructure modules (MongoDB, API server, auth, file storage,
mailer, …) are configured in the same file.

The Media module adds a Finder-style asset library with folders, ACLs, direct
uploads and image derivatives. The Form demo includes an `AssetType` gallery
bound to an automatically provisioned **Event media** folder; its permissions
are derived from the Form page.

The local module lives in [`src/`](./src):

- `src/index.ts` — module lifecycle entry point; also registers the local
  frontend module via `AddFrontendModule`.
- `src/home.ts` — the `home` page: a custom `DemoReadme` Vue component
  (shipped by the frontend module) presenting what this template contains.
- `src/demo-app/` — a **Demo app** sidebar category with three related
  TableViews backed by Mongo collections seeded through fixtures:
  **Users** (roles, avatars), **Projects** (status, budget, progress) and
  **Tasks** (status, priority, relations to a project and an assignee).
  Tasks open as a **kanban board** grouped by status (drag cards between
  columns; the toolbar switches back to the table).
- `src/components/` — a **Components** sidebar category with one page per
  built-in DMS component, each showing its most complete example:

  | Page           | Component(s)                                          |
  | -------------- | ----------------------------------------------------- |
  | Form           | `Form` with field groups, every `DefaultDataTypes` input and a media-library `AssetType` gallery |
  | Dashboard      | `PeriodSelector` + `KpiCard` ×3 + `ChartCard` + `TopListCard`, all sharing one period scope |
  | TableView      | `TableView` over a demo Mongo collection: filter tabs, CRUD, archive, export |
  | Tab            | `Tab` (icons, badges, shortcuts, persisted state)     |
  | Grid           | `Grid` / `GridRow` (colSpan, nested grid)             |
  | Stack          | `HStack` / `VStack` / `Spacer` app shell              |
  | Placeholder    | `Placeholder`                                         |
  | CustomComponent| Project Vue component shipped by the frontend module  |

  The Dashboard cards fetch deterministic demo data from
  `src/components/demo-api.ts` (`/api/components-demo/sales`, `kpi/:metric`,
  `top-products`), so changing the period or comparison refetches every card;
  the TableView page seeds a `components_demo_tasks` collection through a
  `@Fixture`, and the Form page seeds a self-referencing
  `components_demo_topics` collection backing its cascader and relation
  inputs.

## Prerequisites

- **Node.js 24**, the version pinned in [`.nvmrc`](./.nvmrc).
- **corepack**, or pnpm 10.2.0 on your `PATH`. This repository pins
  `"packageManager": "pnpm@10.2.0"`, and the AntelopeJS CLI shells out to a
  bare `pnpm` when it installs and builds modules — so run `corepack enable`
  once (corepack ships with Node) or install pnpm 10.2.0 globally. A different
  major of pnpm on the `PATH` is what usually breaks `pnpm exec ajs project
  modules install`.
- A running MongoDB instance (`mongodb://localhost:27017` by default, see
  `MONGODB_URL` in [Environment](#environment)).

## Getting started

With a CLI release that supports project templates, select **DMS Demo** in
`ajs project init`, or create the project without prompts:

```bash
ajs project init my-app --template "DMS Demo" --yes
cd my-app
pnpm dev
```

The CLI installs both workspace packages with pnpm and preserves
`antelope.config.ts`, including its module configuration and template name.
No setup script or `.env` is required for development. Start MongoDB before
`pnpm dev`; set `MONGODB_URL` in an optional `.env` for a non-default instance.
The frontend discovers the backend and generates an ephemeral session secret.
Restarting the frontend can invalidate sessions.

Older CLI releases, including 1.15.2, do not preserve complete project
templates. Clone directly instead:

```bash
git clone https://github.com/AntelopeJS/template-dms-demo.git my-app
cd my-app
pnpm install
pnpm dev
```

`pnpm dev` runs `ajs project run -w`, which installs every module declared in
`antelope.config.ts`, builds the local module, and starts the DMS backend on
`http://localhost:5010` (or the next free port, see `.antelope/dev.json`).
Modules reference the API origin through the variables `@antelopejs/api`
publishes (`${@api.API_LOCAL_BASE_URL}`, `${@api.API_PUBLIC_BASE_URL}`).

In a second terminal, start the dashboard frontend:

```bash
pnpm frontend:dev
```

`ajs dms dev` discovers the running backend through `.antelope/dev.json` (which
holds only the backend's pid, start time and listening endpoints), reads its
per-boot bootstrap credential from `.antelope/dms-dev.json`, and serves the
dashboard on `http://localhost:3001`. Both files are rewritten on every boot.

`ajs dms dev` listens on `127.0.0.1` only, so the dev server (and the module
sources it serves) is not reachable from another machine. To open the dashboard
from elsewhere — a container, a VM, a phone on the same network — set `HOST`:

```bash
HOST=0.0.0.0 pnpm frontend:dev
```

`ajs dms start` — the production server, as opposed to `ajs dms dev` — defaults
`DMS_COOKIE_SECURE` to `true`, so the browser drops the session cookie and every
login silently fails when you test a production build over plain `http://`. Set
`DMS_COOKIE_SECURE=false` in `.env` for such a run, and leave it unset (or
`true`) behind real TLS.

### First run: create the administrator

Open `http://localhost:3001`. **There are no default credentials.** A fresh
instance has no account at all, so a global frontend middleware sends every
route — including `/` and the configured `homepage` (`/home`) — to
`/onboarding`, the first-run wizard that creates the first administrator.

The password you choose there, like every password in the DMS, must be at least
8 characters long and match this policy (`packages/dms/src/validation/password.ts`
in [`@antelopejs/dms`](https://github.com/AntelopeJS/dms)):

```
/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/
```

That is: at least one uppercase letter, one digit and one special character,
and **only** `@$!%*?&` count as special characters — a password containing, say,
`#` or `-` is rejected. See
[Authentication](https://dms.antelopejs.com/docs/auth-and-tenancy/authentication)
for the rest of the auth system.

Once the wizard has run, the instance stops redirecting to `/onboarding` and
later sign-ins go through **`/auth`**, the login screen (there is no `/login`
route). `/auth/forgot`, `/auth/recover`, `/auth/2fa` and the other auth screens
live under the same prefix.

## Environment

For optional overrides, create a git-ignored `.env` at the repository root.
The default development workflow does not need one. Two processes read it:

- the **backend** (`pnpm dev`) only reads the variables mapped in the
  `envOverrides` block of `antelope.config.ts`;
- the **frontend loader** (`ajs dms`, from
  [`@antelopejs/dms-frontend`](https://github.com/AntelopeJS/dms-frontend))
  reads the `DMS_*` loader variables below.

| Variable | Read by | Purpose | Needed locally |
| --- | --- | --- | --- |
| `DMS_API_BASE_URL` | loader | Backend URL the loader fetches the manifest from; discovered automatically in dev. | no |
| `DMS_SESSION_SECRET` | loader | Key encrypting the session cookie, **at least 32 characters** (`openssl rand -hex 32`). Ephemeral in dev; explicit for build/start. | no |
| `DMS_CLIENT_BASE_URL` | loader | Dashboard URL. | no |
| `DMS_COOKIE_SECURE` | loader | `Secure` flag on the dashboard cookies. Defaults to `false` for `ajs dms dev`, `true` for `ajs dms start`. | no |
| `DMS_HTML_RENDER_SECRET` | loader | Must equal the backend's `dms.config.htmlRender.serviceSecret` (default `dev`). | no |
| `DMS_OAUTH_RELAY_SECRET` | loader | Override for the OAuth relay secret the backend ships in the manifest. | no |
| `DMS_TRUSTED_PROXY_HOPS` | loader | Trusted reverse-proxy hops for `x-forwarded-*`. | no |
| `DMS_API_PUBLIC_BASE_URL` | backend | Public origin of the API, base of asset and e-mail links. **Required** for `ajs project start`. | no |
| `DMS_BOOTSTRAP_SECRET` | backend + loader | Credential gating the frontend manifest. Generated automatically in development; required by `ajs dms build`. | no |
| `MONGODB_URL` | backend | MongoDB connection string. | no (`mongodb://localhost:27017`) |
| `JWT_SECRET` | backend | Secret signing the dashboard's tokens (`openssl rand -hex 32`). `dev` in development; **required** with `-e production`, where the backend refuses to start without it. | production only |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | backend | SMTP relay (port 587) the backend sends e-mail through with `-e production`, which has no Ethereal account. `SMTP_HOST` is required there; credentials and sender are optional. | production only |
| `MONGODB_DATABASE` | backend | MongoDB database name. | no (`template_dms_demo`) |
| `STRIPE_SECRET_KEY` | backend | Stripe secret key. | no |
| `STRIPE_PUBLISHABLE_KEY` | backend | Stripe publishable key. | no |
| `STRIPE_WEBHOOK_SECRET` | backend | Stripe webhook signing secret. | no |

Keep this table and `envOverrides` in sync.

## Configuration notes

- **MongoDB**: set `MONGODB_URL` / `MONGODB_DATABASE` in `.env`, or adjust the
  fallbacks in `mongodb.config` in `antelope.config.ts`.
- **Media storage**: `file-storage-local` stores development assets under
  `.antelope/file-storage` and removes abandoned staged uploads after 24 hours.
  It is not suitable for a clustered production deployment; use
  `@antelopejs/file-storage-s3` with S3 or R2 there.
- **SaaS / Stripe**: the placeholder `STRIPE_*` fallbacks in
  `antelope.config.ts` boot the template fine and let you browse every page;
  real keys are only needed to exercise the billing flows of the `dms-saas`
  module.
  They are read from `.env` and mapped through `envOverrides`; `.env` is
  git-ignored.
- **Frontend builds**: `ajs dms build` needs the backend's
  `dms.config.frontend.bootstrapSecret`, passed as `DMS_BOOTSTRAP_SECRET`. In
  development the backend generates an ephemeral one, so `pnpm frontend:dev`
  needs no configuration.
- **Module frontends**: every DMS feature module ships its own frontend module
  through `AddFrontendModule`. Remove a module block in `antelope.config.ts` to
  drop the feature and its frontend with it.

## The frontend

The dashboard frontend is a Vue 3 / Vite / Inertia application generated by the
[`@antelopejs/dms-frontend`](https://github.com/AntelopeJS/dms-frontend)
loader, run through `ajs dms`. It is not part of this repository: the loader
fetches the frontend manifest from the running backend, materializes every
module's `frontend-vue` directory into a generated workspace, and builds or
serves it.

[`frontend-vue/`](./frontend-vue) is this template's own frontend module. Its
`dms.frontend.ts` entry registers every component under `app/components/` as
`Demo<Name>`, which is how the backend references them — `CustomComponent(
"demo-callout")` in `src/components/custom.ts` resolves to `DemoCallout`. The
module ships:

- `app/components/Readme.vue` → `DemoReadme`, the Home page.
- `app/components/Callout.vue` → `DemoCallout`, the CustomComponent demo.
- `i18n/locales/demo-*.json`, merged into the dashboard's catalogs.

It is a workspace package with its own ESLint, Prettier and Vitest setup.
The root `pnpm install` installs both packages. Each package keeps its existing
lockfile to preserve its dependency resolution. Run frontend checks separately:

```bash
pnpm --dir frontend-vue lint
pnpm --dir frontend-vue test
```

The backend uses TypeScript 7. The frontend installs the same compiler as
`@typescript/native`, alongside `typescript` aliased to
`@typescript/typescript6`: `typescript-eslint` still needs the TypeScript 6
JavaScript API. This follows the [TypeScript migration guide](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).
Keep both packages until the parser supports the TypeScript 7 API.

### Verifying the frontend source

`pnpm frontend:verify` builds and type-checks `frontend-vue` against the
installed `@antelopejs/dms-frontend` release, without starting a backend:

```bash
pnpm frontend:verify
```

It runs `ajs dms verify-source`, which verifies `./frontend-vue` on top of the
DMS core layer, the `frontend-vue` directory of the `@antelopejs/dms` package
installed in `node_modules`. That is why `@antelopejs/dms` is a development
dependency here, in the same range as the backend module in
`antelope.config.ts`: keep the two in step.

`frontend-vue/package.json` declares the `@antelopejs/dms-frontend` releases it
supports under `engines`; the loader refuses a release outside that range.

## Translations

Every backend-declared text (page names, descriptions, form labels, card
titles, column headers, select items…) uses the `$key` convention: a string
starting with `$` is resolved against the i18n catalogs by the frontend
(`processI18n`). Add or edit keys in
`frontend-vue/i18n/locales/demo-en-GB.json` and `demo-fr-FR.json`; the test
suite checks that both catalogs cover every key the backend emits. Known
limitation: TableView **tab labels** are not translated by the frontend, so
they stay in plain English.

## AI coding agents

The DMS and its modules ship their own agent skills (pages and blocks, auth and
permissions, module authoring, dev servers, best practices). The
[antelopejs plugin](https://github.com/AntelopeJS/agent-skills) syncs them into
the project. The skills appear after `pnpm install` (the `@antelopejs/dms`
skills) and the first `pnpm dev` (one skill per `dms-*` module). Start with the
`dms` skill. `AGENTS.md` (which `CLAUDE.md` imports) holds the agent guidance
for this project.

### Claude Code

This repository's `.claude/settings.json` registers the plugin: open the
project in Claude Code, accept the folder trust dialog, and the plugin is
enabled. It syncs the skills into `.claude/skills/`, and `/antelopejs:skills`
lists them. To install it by hand instead:

```bash
claude plugin marketplace add AntelopeJS/agent-skills
claude plugin install antelopejs@antelopejs
```

### Codex

Install the plugin from your shell (or from `/plugins` in Codex once the
marketplace is added):

```bash
codex plugin marketplace add AntelopeJS/agent-skills
codex plugin add antelopejs@antelopejs
```

Sync the skills into `.agents/skills/` from the project root, and again after
installing or upgrading packages:

```bash
npx -y github:AntelopeJS/agent-skills sync --target codex
```

## Documentation

- [Quickstart](https://dms.antelopejs.com/docs/getting-started/quickstart):
  run this template and change a first page.
- [Tutorial](https://dms.antelopejs.com/docs/getting-started/tutorial): add a
  CRM to the running project.
- [Pages & components](https://dms.antelopejs.com/docs/building/pages-and-components):
  how backend declarations become screens.
- [Frontend](https://dms.antelopejs.com/docs/frontend/introduction): the `ajs dms` loader
  and its configuration.
- [AntelopeJS framework](https://framework.antelopejs.com/docs/get-started/introduction):
  modules, interfaces and the `ajs` CLI.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Before you open a pull request, run
`pnpm lint`, `pnpm typecheck` and `pnpm test`.

## License

This repository does not ship a license file yet.
