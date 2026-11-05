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
      globs: ["antelope.config.ts", "src/helio/platform/**"],
      funnels: ["src/helio/platform/provisioning.ts"],
      containments: ["project/database-mapping"],
      why: "`antelope.config.ts` decides which MongoDB database (`MONGODB_URL`, `MONGODB_DATABASE`, the `template_dms_demo` default) and which file storage path every project writes its owner, tenants and uploads to, and `src/helio/platform/` writes Helio's data into the default tenant once, when the DMS provisions it on an empty database: a wrong mapping or a bad first write stays in every database a project already filled",
    },
    format: {
      globs: [
        "src/schema.ts",
        "src/helio/**/database.ts",
        "src/helio/**/table.ts",
        "src/helio/**/*-table.ts",
      ],
      funnels: [],
      containments: ["backend/helio-data"],
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
      containments: [],
      why: "the project config chooses where mail goes (an Ethereal account created over the internet at every development start, the `SMTP_HOST` relay of `-e production`), the Stripe keys of dms-saas and whether dms-marketing records every dashboard visit; Helio's mailing code sends its e-mails through one funnel: a changed value sends a project's mail or its users' clicks to a third party",
    },
    exposure: {
      globs: [
        ".gitignore",
        "frontend.Dockerfile",
        "src/**/*controller.ts",
        "src/**/routes.ts",
        "src/home.ts",
      ],
      funnels: [],
      containments: [],
      why: "every project inherits what git leaves out (a dropped `.env` line commits its secrets) and what the dashboard image copies, and the controllers are its HTTP surface under `/api/helio/*` and `/dms/pages/*`: their routes and guards decide who reads and changes which rows",
    },
    publish: null,
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
