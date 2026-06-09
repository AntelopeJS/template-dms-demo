# template-cms-demo

A minimal [AntelopeJS](https://antelopejs.com) CMS template wiring together every
CMS feature module, plus a tiny local module that exposes a single **Home** page
with a simple contact form.

## What's inside

The CMS feature modules are all installed from npm at their latest published
versions (see [`antelope.config.ts`](./antelope.config.ts)):

| Module            | Package                              |
| ----------------- | ------------------------------------ |
| CMS core          | `@antelopejs-private/cms`            |
| API               | `@antelopejs-private/cms-api`        |
| Database          | `@antelopejs-private/cms-database`   |
| Automation        | `@antelopejs-private/cms-automation` |
| SaaS              | `@antelopejs-private/cms-saas`       |
| AI                | `@antelopejs-private/cms-ai`         |
| Lang / i18n       | `@antelopejs-private/cms-lang`       |
| CI/CD             | `@antelopejs-private/cms-cicd`       |

Supporting infrastructure modules (MongoDB, API server, auth, file storage,
mailer, …) are configured in the same file.

The local module lives in [`src/`](./src):

- `src/index.ts` — module lifecycle entry point.
- `src/home.ts` — the single `home` page, defined as a `PageController` with a
  `Form` (name / email / message).

## Prerequisites

- Node.js 20+
- A running MongoDB instance (`mongodb://localhost:27017` by default)
- The AntelopeJS CLI: `npm i -g @antelopejs/core` (provides the `ajs` command)

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` runs `ajs project run -w`, which installs every module declared in
`antelope.config.ts`, builds the local module, and starts the CMS. The Home page
is served as the configured `homepage` (`/home`).

## Configuration notes

- **MongoDB**: adjust `mongodb.config.url` / `database` in `antelope.config.ts`.
- **SaaS / Stripe**: the `cms-saas` module ships with placeholder Stripe keys.
  Replace `sk_test_replace_me` / `pk_test_replace_me` / `whsec_replace_me` with
  your own credentials (or remove the module) before using it.
- **Modules frontend**: every CMS feature layer is enabled through
  `cms.config.localModules`. Remove an entry there (and its module block) to drop
  a feature.
