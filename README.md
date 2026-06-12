# template-cms-demo

A minimal [AntelopeJS](https://antelopejs.com) CMS template wiring together every
CMS feature module, plus a tiny local module that exposes a **Home** page (a
pretty in-CMS readme), a **Components** catalog showcasing every built-in CMS
component and a small **Demo app** (users / projects / tasks with relations).
All page texts are translated in English and French through the local
nuxt-layer's i18n files.

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

- `src/index.ts` — module lifecycle entry point; also registers the local
  nuxt-layer via `AddNuxtLayer`.
- `src/home.ts` — the `home` page: a custom `DemoReadme` Vue component
  (shipped by the nuxt-layer) presenting what this template contains.
- `src/demo-app/` — a **Demo app** sidebar category with three related
  TableViews backed by Mongo collections seeded through fixtures:
  **Users** (roles, avatars), **Projects** (status, budget, progress) and
  **Tasks** (status, priority, relations to a project and an assignee).
  Tasks open as a **kanban board** grouped by status (drag cards between
  columns; the toolbar switches back to the table).
- `src/components/` — a **Components** sidebar category with one page per
  built-in CMS component, each showing its most complete example:

  | Page           | Component(s)                                          |
  | -------------- | ----------------------------------------------------- |
  | Form           | `Form` with field groups and every `DefaultDataTypes` input (string/textarea, email, phone, password, url, color, number, price, percentage, date/date-range, time, boolean, select, tree, relation, cascader relation, address, permissions, rich text, file, image single/multiple) |
  | Dashboard      | `PeriodSelector` + `KpiCard` ×3 + `ChartCard` + `TopListCard`, all sharing one period scope |
  | TableView      | `TableView` over a demo Mongo collection: filter tabs, CRUD, archive, export |
  | Tree           | `Tree` (static nodes, multi-select, propagation)      |
  | Tab            | `Tab` (icons, badges, shortcuts, persisted state)     |
  | Grid           | `Grid` / `GridRow` (colSpan, nested grid)             |
  | Stack          | `HStack` / `VStack` / `Spacer` app shell              |
  | Placeholder    | `Placeholder`                                         |
  | CustomComponent| Project Vue component shipped by the local nuxt-layer |

  The Dashboard cards fetch deterministic demo data from
  `src/components/demo-api.ts` (`/api/components-demo/sales`, `kpi/:metric`,
  `top-products`), so changing the period or comparison refetches every card;
  the TableView page seeds a `components_demo_tasks` collection through a
  `@Fixture`, and the Form page seeds a self-referencing
  `components_demo_topics` collection backing its cascader and relation
  inputs.
- `nuxt-layer/` — a local Nuxt layer shipping the `DemoReadme` and
  `DemoCallout` Vue components plus the English/French translations
  (`i18n/locales/demo-*.json`). Registered in `src/index.ts` and marked local
  through `cms.config.localModules`.

## Translations

Every backend-declared text (page names, descriptions, form labels, card
titles, column headers, select items…) uses the `$key` convention: a string
starting with `$` is resolved against the i18n catalogs by the frontend
(`processI18n`). Add or edit keys in `nuxt-layer/i18n/locales/demo-en-GB.json`
and `demo-fr-FR.json`. Known limitation: TableView **tab labels** are not
translated by the frontend, so they stay in plain English.

## Prerequisites

- Node.js 20+
- A running MongoDB instance (`mongodb://localhost:27017` by default)
- The AntelopeJS CLI: `npm i -g @antelopejs/core` (provides the `ajs` command)

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Stripe keys
npm run dev
```

`npm run dev` runs `ajs project run -w`, which installs every module declared in
`antelope.config.ts`, builds the local module, and starts the CMS. The Home page
is served as the configured `homepage` (`/home`).

## Configuration notes

- **MongoDB**: adjust `mongodb.config.url` / `database` in `antelope.config.ts`.
- **SaaS / Stripe**: Stripe credentials are read from `.env` (loaded via
  `dotenv` and mapped through `envOverrides` in `antelope.config.ts`). Copy
  `.env.example` to `.env` and set `STRIPE_SECRET_KEY`,
  `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET`. The `.env` file is
  git-ignored; the placeholder values in the config act as fallbacks.
- **Modules frontend**: every CMS feature layer is enabled through
  `cms.config.localModules`. Remove an entry there (and its module block) to drop
  a feature.
