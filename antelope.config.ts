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
    CMS_API_BASE_URL: "modules.cms.config.apiBaseUrl",
    CMS_BOOTSTRAP_SECRET: "modules.cms.config.nuxt.bootstrapSecret",
    CMS_CLIENT_BASE_URL: "modules.cms.config.clientBaseUrl",
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
        // Not `pnpm build`: that starts with `rimraf dist`, and the running
        // module is loaded from dist. Watch reloads compile in place.
        reloadCommand: ["pnpm exec tsc -p tsconfig.build.json"],
      },
    },

    // CMS core: hosts the Nuxt frontend and enables every CMS feature layer.
    cms: {
      source: {
        type: "package",
        package: "@antelopejs-private/cms",
        version: "^0.6.6",
      },
      config: {
        apiBaseUrl: "http://localhost:5010",
        clientBaseUrl: "http://localhost:3000",
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
        version: "^0.1.12",
      },
    },
    "cms-database": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-database",
        version: "^0.0.20",
      },
    },
    "cms-automation": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-automation",
        version: "^0.2.5",
      },
    },
    "cms-saas": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-saas",
        version: "0.2.8",
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
        version: "^0.0.17",
      },
    },
    "cms-lang": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-lang",
        version: "^0.1.8",
      },
      config: {
        editable: true,
      },
    },
    "cms-cicd": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-cicd",
        version: "^0.0.12",
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
        version: "^0.0.4",
      },
    },
    "cms-media": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-media",
        version: "0.0.5",
      },
      config: {},
    },

    // ---- Infrastructure modules required by the CMS ----
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.3.0",
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
