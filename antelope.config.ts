import { resolve } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(__dirname, ".env") });

// Floors of the DMS module set this template was verified with. Every range
// stays below 1.0.0 so the whole set resolves on one interface-dms copy, which
// the core requires.
const DMS_VERSIONS = {
  "@antelopejs/dms": ">=0.3.7 <1.0.0",
  "@antelopejs/dms-api": ">=0.1.3 <1.0.0",
  "@antelopejs/dms-database": ">=0.0.6 <1.0.0",
  "@antelopejs/dms-automation": ">=0.1.5 <1.0.0",
  "@antelopejs/dms-saas": ">=0.1.8 <1.0.0",
  "@antelopejs/dms-ai": ">=0.0.6 <1.0.0",
  "@antelopejs/dms-lang": ">=0.0.4 <1.0.0",
  "@antelopejs/dms-builder": ">=0.1.3 <1.0.0",
  "@antelopejs/dms-media": ">=0.0.5 <1.0.0",
  "@antelopejs/dms-marketing": ">=0.2.5 <1.0.0",
  "@antelopejs/dms-mailing": ">=0.2.3 <1.0.0",
};

// Port the API server listens on. `DMS_API_PORT` is optional and documented in
// the README environment table; it moves the whole backend surface at once: the
// api module's listener, the default `dms.config.apiBaseUrl` and the base URL
// `file-storage-local` builds asset links with. It cannot go through `envOverrides` below because the api
// port lives inside the `servers` array and the core's override writer only
// walks plain objects.
const API_PORT = process.env.DMS_API_PORT ?? "5010";

export default defineConfig({
  name: "template-dms-demo",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  // Map environment variables (loaded from .env) onto module config paths.
  envOverrides: {
    DMS_API_BASE_URL: "modules.dms.config.apiBaseUrl",
    DMS_CLIENT_BASE_URL: "modules.dms.config.clientBaseUrl",
    DMS_BOOTSTRAP_SECRET: "modules.dms.config.frontend.bootstrapSecret",
    MONGODB_URL: "modules.mongodb.config.url",
    MONGODB_DATABASE: "modules.mongodb.config.database",
    STRIPE_SECRET_KEY: "modules.dms-saas.config.stripe.secretKey",
    STRIPE_PUBLISHABLE_KEY: "modules.dms-saas.config.stripe.publishableKey",
    STRIPE_WEBHOOK_SECRET: "modules.dms-saas.config.stripe.webhookSecret",
  },
  modules: {
    // Local module of this template: registers the demo pages (see src/) and
    // ships the frontend-vue module that carries their Vue components.
    "template-dms-demo": {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["pnpm install", "pnpm run build"],
        // Not `pnpm build`: that starts with `rimraf dist`, and the running
        // module is loaded from dist. Watch reloads compile in place.
        reloadCommand: ["pnpm exec tsc -p tsconfig.build.json"],
      },
    },

    // DMS core: serves the frontend manifest consumed by `ajs dms` and enables
    // every DMS feature layer.
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: DMS_VERSIONS["@antelopejs/dms"],
      },
      config: {
        apiBaseUrl: `http://localhost:${API_PORT}`,
        clientBaseUrl: "http://localhost:3001",
        homepage: "/home",
        meta: {
          title: "Template DMS Demo",
          description: "AntelopeJS DMS demo template",
        },
        auth: {
          jwtSecret: "dev",
        },
        frontend: {
          // Credential `ajs dms build` presents to fetch the frontend manifest
          // and module sources. In development the instance generates an
          // ephemeral one in .antelope/dms-dev.json, so `pnpm frontend:dev`
          // needs nothing here; set DMS_BOOTSTRAP_SECRET in .env for builds.
          bootstrapSecret: "",
        },
      },
    },

    // ---- DMS feature modules ----
    "dms-api": {
      source: {
        type: "package",
        package: "@antelopejs/dms-api",
        version: DMS_VERSIONS["@antelopejs/dms-api"],
      },
    },
    "dms-database": {
      source: {
        type: "package",
        package: "@antelopejs/dms-database",
        version: DMS_VERSIONS["@antelopejs/dms-database"],
      },
    },
    "dms-automation": {
      source: {
        type: "package",
        package: "@antelopejs/dms-automation",
        version: DMS_VERSIONS["@antelopejs/dms-automation"],
      },
    },
    "dms-saas": {
      source: {
        type: "package",
        package: "@antelopejs/dms-saas",
        version: DMS_VERSIONS["@antelopejs/dms-saas"],
      },
      config: {
        // Fallback values; overridden by the STRIPE_* variables from .env
        // (see envOverrides above). Set real keys in .env to exercise billing.
        stripe: {
          secretKey: "sk_test_replace_me",
          publishableKey: "pk_test_replace_me",
          webhookSecret: "whsec_replace_me",
        },
        allowedRedirectHosts: [
          "localhost:3000",
          "localhost:3001",
          "127.0.0.1:3000",
          "127.0.0.1:3001",
        ],
      },
    },
    "dms-ai": {
      source: {
        type: "package",
        package: "@antelopejs/dms-ai",
        version: DMS_VERSIONS["@antelopejs/dms-ai"],
      },
    },
    "dms-lang": {
      source: {
        type: "package",
        package: "@antelopejs/dms-lang",
        version: DMS_VERSIONS["@antelopejs/dms-lang"],
      },
      config: {
        editable: true,
      },
    },
    "dms-builder": {
      source: {
        type: "package",
        package: "@antelopejs/dms-builder",
        version: DMS_VERSIONS["@antelopejs/dms-builder"],
      },
    },
    "dms-media": {
      source: {
        type: "package",
        package: "@antelopejs/dms-media",
        version: DMS_VERSIONS["@antelopejs/dms-media"],
      },
      config: {},
    },

    // Traffic analytics, conversion funnels and click heatmaps. Every setting
    // is optional and also editable from the module's own settings page.
    "dms-marketing": {
      source: {
        type: "package",
        package: "@antelopejs/dms-marketing",
        version: DMS_VERSIONS["@antelopejs/dms-marketing"],
      },
      config: {},
    },

    // Template library, e-mail editor and send log. Sends through the
    // `nodemailer` module configured below.
    "dms-mailing": {
      source: {
        type: "package",
        package: "@antelopejs/dms-mailing",
        version: DMS_VERSIONS["@antelopejs/dms-mailing"],
      },
      config: {},
    },

    // ---- Infrastructure modules required by the DMS ----
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.3.0",
      },
      config: {
        // Fallback values; overridden by MONGODB_URL / MONGODB_DATABASE from
        // .env (see envOverrides above).
        url: "mongodb://localhost:27017",
        database: "template_dms_demo",
      },
      importOverrides: [],
      disabledExports: [],
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "^1.0.3",
      },
      config: {
        secret: "dev",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "^1.2.5",
      },
      config: {
        servers: [
          {
            protocol: "http",
            port: API_PORT,
          },
        ],
        cors: {
          allowedOrigins: [
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            /^https:\/\/[^/]+\.onamp\.dev$/,
            ...(process.env.DMS_CLIENT_BASE_URL
              ? [process.env.DMS_CLIENT_BASE_URL]
              : []),
          ],
        },
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "^0.1.5",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: `http://127.0.0.1:${API_PORT}`,
        defaultVisibility: "private",
        stagingExpiration: 24 * 60 * 60,
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "^0.0.5",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
