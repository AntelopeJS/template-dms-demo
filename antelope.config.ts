import { resolve } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(__dirname, ".env") });

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
    DMS_BOOTSTRAP_SECRET: "modules.dms.config.nuxt.bootstrapSecret",
    DMS_CLIENT_BASE_URL: "modules.dms.config.clientBaseUrl",
    STRIPE_SECRET_KEY: "modules.dms-saas.config.stripe.secretKey",
    STRIPE_PUBLISHABLE_KEY: "modules.dms-saas.config.stripe.publishableKey",
    STRIPE_WEBHOOK_SECRET: "modules.dms-saas.config.stripe.webhookSecret",
  },
  modules: {
    // Local module of this template: registers the single "home" page (see src/).
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

    // DMS core: hosts the Nuxt frontend and enables every DMS feature layer.
    dms: {
      source: {
        type: "package",
        package: "@antelopejs-private/dms",
        version: "^0.8.3",
      },
      config: {
        apiBaseUrl: "http://localhost:5010",
        clientBaseUrl: "http://localhost:3000",
        homepage: "/home",
        meta: {
          title: "Template DMS Demo",
          description: "AntelopeJS DMS demo template",
        },
        auth: {
          jwtSecret: "dev",
        },
      },
    },

    // ---- DMS feature modules (caret ranges on latest published versions) ----
    "dms-api": {
      source: {
        type: "package",
        package: "@antelopejs-private/dms-api",
        version: "^0.1.14",
      },
    },
    "dms-database": {
      source: {
        type: "package",
        package: "@antelopejs-private/dms-database",
        version: "^0.0.22",
      },
    },
    "dms-automation": {
      source: {
        type: "package",
        package: "@antelopejs-private/dms-automation",
        version: "^0.2.6",
      },
    },
    "dms-saas": {
      source: {
        type: "package",
        package: "@antelopejs-private/dms-saas",
        version: "^0.2.11",
      },
      config: {
        // Fallback values; overridden by the STRIPE_* variables from .env
        // (see envOverrides above). Copy .env.example to .env to set real keys.
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
        package: "@antelopejs-private/dms-ai",
        version: "^0.0.18",
      },
    },
    "dms-lang": {
      source: {
        type: "package",
        package: "@antelopejs-private/dms-lang",
        version: "^0.1.9",
      },
      config: {
        editable: true,
      },
    },
    "dms-cicd": {
      source: {
        type: "package",
        package: "@antelopejs-private/dms-cicd",
        version: "^0.0.13",
      },
      config: {
        // Allow write git operations (commit, tag, branch, push) in the demo.
        // Defaults to false (read-only, visualization only).
        allowGitOperations: true,
      },
    },
    "dms-builder": {
      source: {
        type: "package",
        package: "@antelopejs-private/dms-builder",
        version: "^0.0.5",
      },
    },
    "dms-media": {
      source: {
        type: "package",
        package: "@antelopejs-private/dms-media",
        version: "^0.0.7",
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
        version: "^1.2.4",
      },
      config: {
        servers: [
          {
            protocol: "http",
            port: "5010",
          },
        ],
        cors: {
          allowedOrigins: [/^https:\/\/[a-z0-9-]+\.onamp\.dev$/],
        },
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "^0.1.4",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: "http://127.0.0.1:5010",
        defaultVisibility: "private",
        stagingExpiration: 24 * 60 * 60,
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "^0.0.4",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
