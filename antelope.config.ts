import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "template-cms-demo",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  modules: {
    // Local module of this template: registers the single "home" page (see src/).
    "template-cms-demo": {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["npm install", "npm run build"],
      },
    },

    // CMS core: hosts the Nuxt frontend and enables every CMS feature layer.
    cms: {
      source: {
        type: "package",
        package: "@antelopejs-private/cms",
        version: "0.0.12",
      },
      config: {
        localModules: [
          "@antelopejs-private/cms-nuxt-layer",
          "@antelopejs-private/cms-api",
          "@antelopejs/cms-database-nuxt-layer",
          "@antelopejs-private/cms-automation",
          "@antelopejs/cms-saas-nuxt-layer",
          "@antelopejs-private/cms-ai-nuxt-layer",
          "@antelopejs/cms-lang-nuxt-layer",
          "@antelopejs/cms-cicd-nuxt-layer",
        ],
        homepage: "/home",
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
        version: "0.0.3",
      },
    },
    "cms-database": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-database",
        version: "0.0.3",
      },
    },
    "cms-automation": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-automation",
        version: "0.0.2",
      },
    },
    "cms-saas": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-saas",
        version: "0.0.3",
      },
      config: {
        // Replace with your own Stripe credentials to enable the SaaS module.
        stripe: {
          secretKey: "sk_test_replace_me",
          publishableKey: "pk_test_replace_me",
          webhookSecret: "whsec_replace_me",
        },
      },
    },
    "cms-ai": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-ai",
        version: "0.0.2",
      },
    },
    "cms-lang": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-lang",
        version: "0.0.3",
      },
    },
    "cms-cicd": {
      source: {
        type: "package",
        package: "@antelopejs-private/cms-cicd",
        version: "0.0.2",
      },
    },

    // ---- Infrastructure modules required by the CMS ----
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "1.2.2",
      },
      config: {
        url: "mongodb://localhost:27017",
        database: "template_cms_demo",
      },
      importOverrides: [],
      disabledExports: [],
    },
    "database-decorators": {
      source: {
        type: "package",
        package: "@antelopejs/database-decorators",
        version: "1.1.1",
      },
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "1.0.0",
      },
      config: {
        secret: "dev",
      },
    },
    "data-api": {
      source: {
        type: "package",
        package: "@antelopejs/data-api",
        version: "1.1.1",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "1.0.0",
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
        version: "0.0.2",
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
        version: "0.0.2",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
