import type { VerifyConfig } from "@antelopejs/tooling-configs/verify";

import { backendJourneys } from "./journeys-backend.ts";
import { deployJourneys } from "./journeys-deploy.ts";
import { frontendJourneys } from "./journeys-frontend.ts";
import { projectJourneys } from "./journeys-project.ts";
import { repoJourneys } from "./journeys-repo.ts";
import { ONBOARDING_LINE, TEMPLATE } from "./project.ts";

const config: VerifyConfig = {
  doors: {
    data: {
      globs: [
        "antelope.config.ts",
        "src/helio/platform/**",
        "src/helio/**/fixtures.ts",
      ],
      funnels: ["src/helio/platform/provisioning.ts"],
      why: "`antelope.config.ts` decides which MongoDB database (`MONGODB_URL`, `MONGODB_DATABASE`, the `template_dms_demo` default) and which file storage path every project writes its owner, tenants and uploads to, `src/helio/platform/` writes Helio's data into the default tenant once, when the DMS provisions it on an empty database, and each `fixtures.ts` seeds its table once on an empty one: a wrong mapping or a bad first write stays in every database a project already filled",
    },
    format: {
      globs: [
        "src/schema.ts",
        "src/helio/**/database.ts",
        "src/helio/**/table.ts",
        "src/helio/**/*-table.ts",
        "src/helio/platform/mailing/notices.ts",
      ],
      funnels: [],
      why: "the template's tables are stored as `template-dms-demo__<table>` collections holding the fields their classes declare: rows a running project already holds are read by the next release under the same schema name, table names and fields",
    },
    contract: null,
    outbound: {
      globs: [
        "antelope.config.ts",
        "src/helio/platform/mailing/**",
        "src/helio/platform/marketing/**",
      ],
      funnels: ["src/helio/platform/mailing/send.ts"],
      why: "the project config chooses where mail goes (an Ethereal account created over the internet at every development start, the `SMTP_HOST` relay of `-e production`), the Stripe keys of dms-saas and whether dms-marketing records every dashboard visit; Helio's mailing code sends its e-mails through one funnel: a changed value sends a project's mail or its users' clicks to a third party",
    },
    exposure: {
      globs: [
        ".gitignore",
        "frontend-vue/.gitignore",
        "frontend.Dockerfile",
        "src/**/*controller.ts",
        "src/**/*routes.ts",
        "src/**/*page.ts",
        "src/helio/catalog/visuals.ts",
        "src/home.ts",
      ],
      funnels: [],
      why: "every project inherits what git leaves out (a dropped `.env` line commits its secrets) and what the dashboard image copies, and the files that declare routes (`@Get`, `@Post`, `@Put`, `@Delete`, `@Route`) or register pages are its HTTP surface under `/api/helio/*` and `/dms/pages/*`: their routes and guards decide who reads and changes which rows",
    },
    publish: {
      globs: [".cicd/**"],
      funnels: [],
      why: "`.cicd/environments.json` maps the branch `main` to the production environment and `stage` to staging, a deploy trigger every project created from the template inherits: a changed branch or environment decides which pushes are deployed",
    },
  },
  env: { MONGODB_URL: "mongodb://127.0.0.1:9" },
  services: {
    mongo: {
      image: "mongo:8.0",
      port: 27017,
      ready: ["mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"],
      reset: [
        "mongosh",
        "--quiet",
        "--eval",
        "db.getMongo().getDBNames().filter((name) => !['admin', 'config', 'local'].includes(name)).forEach((name) => db.getSiblingDB(name).dropDatabase())",
      ],
    },
  },
  template: {
    name: TEMPLATE,
    project: true,
    probe: { log: ONBOARDING_LINE, settleMs: 3000 },
  },
  journeys: {
    ...projectJourneys,
    ...deployJourneys,
    ...backendJourneys,
    ...frontendJourneys,
    ...repoJourneys,
  },
};

export default config;
