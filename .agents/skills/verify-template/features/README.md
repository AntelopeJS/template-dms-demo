# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, and `journeys:` the journeys it runs. `pnpm exec antelopejs-verify map` checks that every user-facing file is covered: in a template that is every file a scaffolded project carries.

The first journey of a run creates the project the way the README says: `ajs project init` from an offline manifest that lists the working tree as the `DMS Demo` project template, then `pnpm install --frozen-lockfile`. Every journey works in its own copy of that one build (`context.prepared("scaffolded", ...)`, shared with the pack's `scaffold-checks`). A journey that runs the backend starts `ajs project dev --watch` (what `pnpm dev` runs) with `MONGODB_URL` pointing at the run's `mongo:8.0` container, waits for the onboarding line and for `/api/system-state`, and reads the API origin from `.antelope/dev.json` as `ajs dms dev` does. `ajs project dev` installs the eleven DMS feature modules and the infrastructure modules from the npm registry into `.antelope/cache`, and nodemailer creates an Ethereal account over the internet at every development start, so the journeys need network access. MongoDB is read back with `mongosh` in the container next to what the API answered.

| Feature | What the user does | Journeys |
|---|---|---|
| [smoke](smoke.md) | Creates the project, starts it, stops it and runs its checks. | scaffold-dev, scaffold-checks |
| [backend](backend.md) | Opens the home page and works with Helio's data. | home-page, helio-data, restart |
| [frontend](frontend.md) | Runs the dashboard and the frontend module's checks. | frontend-checks, frontend-verify, dashboard-dev |
| [project](project.md) | Creates the first administrator and configures the project through `.env` and `-e production`, and builds the dashboard image. | onboarding, database-mapping, production-env, frontend-image |
| [tooling](tooling.md) | Runs `pnpm run checks` and relies on lint, typecheck and format. | scaffold-checks, lint-rejects |
| [docs](docs.md) | Follows README.md and AGENTS.md. | docs-claims |
| [git](git.md) | Commits in the project. | gitignore |

## Doors

- `data`: `antelope.config.ts`, `src/helio/platform/**` and every `src/helio/**/fixtures.ts`, checked by `project/database-mapping`, which also reads the plans Helio's first write provisioned.
- `format`: the schema name, every file that registers a table (`src/helio/**/database.ts` and `src/helio/platform/mailing/notices.ts`), checked by `backend/helio-data`, which compares the full set of `template-dms-demo__*` collection names and the fields of the stored customers.
- `contract`: none. A project created from the template is a copy that no other repository or deployed client consumes: the `/api/helio/*` routes serve the template's own dashboard, deployed from the same commit, and the module and interface ranges are resolved again at every install, so a revert reaches the next project the same way the change did.
- `outbound`: `antelope.config.ts` and Helio's mailing and marketing code, with `src/helio/platform/mailing/send.ts` as the mail funnel.
- `exposure`: `.gitignore` and `frontend-vue/.gitignore`, `frontend.Dockerfile` and every file that declares routes or registers pages: `*controller.ts`, `*routes.ts`, `*page.ts`, `src/helio/catalog/visuals.ts` and `src/home.ts`. `backend/helio-data` checks that the guarded routes refuse a request without a token.
- `publish`: `.cicd/**`. `package.json` is private and nothing is published to a registry, but `.cicd/environments.json` maps the branch `main` to the production environment and `stage` to staging, a deploy trigger every project created from the template inherits. It is a one-way door a verdict lists.

## Gotchas

- `verify.config.ts` sets `MONGODB_URL` to a closed port for every driven command: a journey that forgets the run's MongoDB fails at once instead of writing into whatever answers on `localhost:27017`.
- The run's MongoDB is reset before every journey: every database but `admin`, `config` and `local` is dropped.
