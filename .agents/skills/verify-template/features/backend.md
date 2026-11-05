---
covers:
  - src/**
  - content/**
docs:
  - README.md
journeys:
  - home-page
  - helio-data
  - restart
---

# Backend

The local module the project loads from `src/`: the home page, Helio's tables, fixtures, data controllers and pages, and the data Helio provisions in the other DMS modules.

## Sub-features

- `home-page`: a section without a token is a 401; the owner's `/dms/pages/home/pagelayout` holds the `DemoHomeHero` and `DemoHomeProse` blocks and one block fetching each section `content/home/` holds; each section answers its `.en-GB.md` file by default and its `.fr-FR.md` file to `x-content-language: fr-FR`, another language falls back to English, an unknown section is a 404; `/dms/pages/home/figures` answers its five cells, the collections figure equals the number of `template-dms-demo__helio_*` collections in MongoDB, and the Vue figure is 0, as the README's "with no line of Vue" says.
- `helio-data`: `/api/helio/customers/list` without a token is a 401; with the owner's token it answers every row of `template-dms-demo__helio_customers` (the fixtures wrote them); a business with a VAT number whose check digits are wrong is a 400, a valid one is created as sent; deleting an active customer is a 409, archiving then deleting it removes it from MongoDB. This is the containment journey of the Format door.
- `restart`: with `HELIO_SIMULATORS=off`, the first start provisions the default tenant with every Helio step (the DMS clears `provisioningPending` only when every step succeeded); a second start on the same database changes the count of no demo collection, tenant, plan, e-mail template or media folder (the fixtures and the provisioning write once), and the setup token the second start prints creates the owner.

## How to get to it (user POV)

- `pnpm dev`, `pnpm frontend:dev`, create the owner on the onboarding address, then open Home and Helio > Customers.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" backend
```

## Gotchas

- The service desk and fleet monitoring simulators write tickets and site readings while the backend runs, so the journeys that compare counts run with `HELIO_SIMULATORS=off`, as the README documents, and `helio-data` compares only customers.
- Helio provisions the default tenant in the background after the onboarding line: the media library and the marketing history land several seconds later, so `restart` waits for `provisioningPending` to clear before it counts.
- The journeys call the API the dashboard calls, with the bearer token `/api/auth/login` answers; the dashboard itself is driven by `frontend/dashboard-dev`.
