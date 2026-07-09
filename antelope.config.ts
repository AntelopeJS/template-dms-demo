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
        version: "0.1.9",
      },
      config: {
        homepage: "/home",
        // Mark the template's nuxt-layer (registered via AddNuxtLayer in
        // src/index.ts) as a local module for frontend dev reload.
        localModules: ["template-cms-demo-nuxt-layer"],
        meta: {
          title: "Template CMS Demo",
          description: "AntelopeJS CMS demo template",
        },
      },
    },

    // ---- CMS feature modules (latest published npm versions) ----
    "cms-api": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-api",
        version: "0.1.3",
      },
    },
    "cms-database": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-database",
        version: "0.0.12",
      },
    },
    "cms-automation": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-automation",
        version: "0.1.2",
      },
    },
    "cms-saas": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-saas",
        version: "0.1.4",
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
        version: "0.0.11",
      },
    },
    "cms-lang": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-lang",
        version: "0.1.2",
      },
      config: {
        editable: true,
      },
    },
    "cms-cicd": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-cicd",
        version: "0.0.9",
      },
      config: {
        // Allow write git operations (commit, tag, branch, push) in the demo.
        // Defaults to false (read-only, visualization only).
        allowGitOperations: true,
      },
    },

    // ---- Infrastructure modules required by the CMS ----
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "1.2.3",
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
        version: "1.0.1",
      },
      config: {
        secret: "dev",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "1.1.3",
      },
      config: {
        servers: [
          {
            protocol: "http",
            port: "5010",
          },
        ],
        cors: {
          allowedOrigins: [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
          ],
        },
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "0.1.1",
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
        version: "0.0.3",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
