import { resolve } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(__dirname, ".env") });

export default defineConfig({
  name: "template-cms-demo",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  // Map environment variables (loaded from .env) onto module config paths.
  envOverrides: {
    STRIPE_SECRET_KEY: "modules.cms-saas.config.stripe.secretKey",
    STRIPE_PUBLISHABLE_KEY: "modules.cms-saas.config.stripe.publishableKey",
    STRIPE_WEBHOOK_SECRET: "modules.cms-saas.config.stripe.webhookSecret",
  },
  modules: {
    // Local module of this template: registers the single "home" page (see src/).
    "template-cms-demo": {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["pnpm install", "pnpm run build"],
        reloadCommand: ["pnpm exec tsc"],
      },
    },

    // CMS core: hosts the Nuxt frontend and enables every CMS feature layer.
    cms: {
      source: {
        type: "package",
        package: "@antelopejs-private/cms",
        version: "^0.3.0",
      },
      config: {
        homepage: "/home",
        meta: {
          title: "Template CMS Demo",
          description: "AntelopeJS CMS demo template",
        },
        auth: {
          jwtSecret: "dev",
        },
      },
    },

    // ---- CMS feature modules (caret ranges on latest published versions) ----
    "cms-api": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-api",
        version: "^0.1.9",
      },
    },
    "cms-database": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-database",
        version: "^0.0.17",
      },
    },
    "cms-automation": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-automation",
        version: "^0.2.3",
      },
    },
    "cms-saas": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-saas",
        version: "^0.1.12",
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
    "cms-ai": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-ai",
        version: "^0.0.16",
      },
    },
    "cms-lang": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-lang",
        version: "^0.1.6",
      },
      config: {
        editable: true,
      },
    },
    "cms-cicd": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-cicd",
        version: "^0.0.11",
      },
      config: {
        // Allow write git operations (commit, tag, branch, push) in the demo.
        // Defaults to false (read-only, visualization only).
        allowGitOperations: true,
      },
    },
    "cms-builder": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-builder",
        version: "^0.0.2",
      },
    },

    // ---- Infrastructure modules required by the CMS ----
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.2.4",
      },
      config: {
        url: "mongodb://localhost:27017",
        database: "template_cms_demo",
      },
      importOverrides: [],
      disabledExports: [],
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "^1.0.1",
      },
      config: {
        secret: "dev",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "^1.2.0",
      },
      config: {
        servers: [
          {
            protocol: "http",
            port: "5010",
          },
        ],
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "^0.1.2",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: "http://127.0.0.1:5010",
        defaultVisibility: "private",
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "^0.0.3",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
