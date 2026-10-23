import { resolve } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { config as loadDotenv } from "dotenv";
import { clientOrigins } from "./src/client-origin";

loadDotenv({ path: resolve(__dirname, ".env") });

// The dashboard's origin: DMS_CLIENT_BASE_URL, else `ajs dms dev`'s. Read when
// the configuration is evaluated, which a deployment does at start
// (`--refresh-config`); production refuses to start without it.
const CLIENT_ORIGINS = clientOrigins();
const CLIENT_BASE_URL = CLIENT_ORIGINS[0];

export default defineConfig({
  name: "template-dms-demo",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  envOverrides: {
    DMS_API_PUBLIC_BASE_URL: "modules.api.config.publicBaseUrl",
    DMS_BOOTSTRAP_SECRET: "modules.dms.config.frontend.bootstrapSecret",
    DMS_HTML_RENDER_SECRET: "modules.dms.config.htmlRender.serviceSecret",
    // One secret signs and verifies the dashboard's tokens.
    JWT_SECRET: [
      "modules.dms.config.auth.jwtSecret",
      "modules.auth-jwt.config.secret",
    ],
    MONGODB_URL: "modules.mongodb.config.url",
    // Where uploaded files live; a read-only container needs a writable path.
    FILE_STORAGE_PATH: "modules.file-storage-local.config.storagePath",
    SMTP_HOST: "modules.nodemailer.config.host",
    SMTP_USER: "modules.nodemailer.config.auth.user",
    SMTP_PASSWORD: "modules.nodemailer.config.auth.pass",
    SMTP_FROM: "modules.nodemailer.config.defaults.from",
    MONGODB_DATABASE: "modules.mongodb.config.database",
    STRIPE_SECRET_KEY: "modules.dms-saas.config.stripe.secretKey",
    STRIPE_PUBLISHABLE_KEY: "modules.dms-saas.config.stripe.publishableKey",
    STRIPE_WEBHOOK_SECRET: "modules.dms-saas.config.stripe.webhookSecret",
  },
  // `ajs project build/start -e production`: no development secret, and the
  // module refuses to start until JWT_SECRET, DMS_HTML_RENDER_SECRET and
  // DMS_CLIENT_BASE_URL are set.
  environments: {
    production: {
      modules: {
        "template-dms-demo": {
          config: {
            requireJwtSecret: true,
            requireHtmlRenderSecret: true,
            requireClientBaseUrl: true,
          },
        },
        dms: { config: { auth: { jwtSecret: "" } } },
        "auth-jwt": { config: { secret: "" } },
        // Ethereal creates an account over the internet at every start;
        // production sends through the SMTP relay SMTP_HOST names.
        nodemailer: { config: { ethereal: false, port: 587 } },
      },
    },
  },
  modules: {
    "template-dms-demo": {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["pnpm install", "pnpm run build"],
        // Not `pnpm build`: it starts with `rimraf dist`, and the running module is loaded from dist.
        reloadCommand: ["pnpm exec tsc"],
      },
      config: {
        // Development signs tokens with the public "dev" secret below.
        requireJwtSecret: false,
      },
    },

    // DMS modules stay below 1.0.0 so they all resolve on one interface-dms copy.
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: ">=0.11.0 <1.0.0",
      },
      config: {
        apiBaseUrl: "${@api.API_PUBLIC_BASE_URL}",
        clientBaseUrl: CLIENT_BASE_URL,
        homepage: "/home",
        meta: {
          title: "Template DMS Demo",
          description: "AntelopeJS DMS demo template",
        },
        auth: {
          jwtSecret: "dev",
        },
        frontend: {
          // Generated in .antelope/dms-dev.json in development; set DMS_BOOTSTRAP_SECRET for builds.
          bootstrapSecret: "",
        },
      },
    },
    "dms-api": {
      source: {
        type: "package",
        package: "@antelopejs/dms-api",
        version: ">=0.5.0 <1.0.0",
      },
    },
    "dms-database": {
      source: {
        type: "package",
        package: "@antelopejs/dms-database",
        version: ">=0.3.0 <1.0.0",
      },
    },
    "dms-automation": {
      source: {
        type: "package",
        package: "@antelopejs/dms-automation",
        version: ">=0.6.0 <1.0.0",
      },
    },
    "dms-saas": {
      source: {
        type: "package",
        package: "@antelopejs/dms-saas",
        version: ">=0.9.0 <1.0.0",
      },
      config: {
        stripe: {
          secretKey: "sk_test_placeholder",
          publishableKey: "pk_test_placeholder",
          webhookSecret: "whsec_placeholder",
        },
        allowedRedirectHosts: CLIENT_ORIGINS.map(
          (origin) => new URL(origin).host,
        ),
      },
    },
    "dms-ai": {
      source: {
        type: "package",
        package: "@antelopejs/dms-ai",
        version: ">=0.6.0 <1.0.0",
      },
      config: {
        // The sidecar runs on this host, so it reaches the API over loopback.
        backendUrl: "${@api.API_LOCAL_BASE_URL}",
      },
    },
    "dms-lang": {
      source: {
        type: "package",
        package: "@antelopejs/dms-lang",
        version: ">=0.4.0 <1.0.0",
      },
      config: {
        editable: true,
      },
    },
    "dms-builder": {
      source: {
        type: "package",
        package: "@antelopejs/dms-builder",
        version: ">=0.6.0 <1.0.0",
      },
    },
    "dms-media": {
      source: {
        type: "package",
        package: "@antelopejs/dms-media",
        version: ">=0.7.0 <1.0.0",
      },
    },
    "dms-marketing": {
      source: {
        type: "package",
        package: "@antelopejs/dms-marketing",
        version: ">=0.8.0 <1.0.0",
      },
      config: {
        // Track the dashboard itself, so Marketing shows how the demo is used.
        dashboardTracking: {
          enabled: true,
          // Draw the click heatmaps over snapshots of the dashboard pages.
          snapshots: true,
        },
        // Every visit records its clicks and scrolls, so the demo heatmaps fill quickly.
        heatmapSampleRate: 1,
      },
    },
    "dms-mailing": {
      source: {
        type: "package",
        package: "@antelopejs/dms-mailing",
        version: ">=0.8.0 <1.0.0",
      },
    },

    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        // 1.4.4 (mongodb#54) resolves a single row's relations next to a
        // computed field: the products' edit form reads its range again.
        version: "^1.4.4",
      },
      config: {
        url: "mongodb://localhost:27017",
        database: "template_dms_demo",
      },
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "^1.0.4",
      },
      config: {
        secret: "dev",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        // 1.3.0 publishes the API_* variables referenced above; 1.3.3 ends open
        // connections on stop, so Ctrl+C does not wait for a dashboard tab;
        // 1.4.0 answers 503 until every module has started (core 1.17.0).
        version: "^1.4.0",
      },
      config: {
        servers: [
          {
            protocol: "http",
            port: 5010,
          },
        ],
        cors: {
          allowedOrigins: CLIENT_ORIGINS,
        },
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "^0.1.10",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: "${@api.API_PUBLIC_BASE_URL}",
        defaultVisibility: "private",
        stagingExpiration: 24 * 60 * 60,
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "^0.0.6",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
