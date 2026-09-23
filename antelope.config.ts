import { resolve } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(__dirname, ".env") });

// `localhost` and `127.0.0.1` are distinct browser origins.
const CLIENT_ORIGINS = ["http://localhost:3001", "http://127.0.0.1:3001"];
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
    MONGODB_URL: "modules.mongodb.config.url",
    MONGODB_DATABASE: "modules.mongodb.config.database",
    STRIPE_SECRET_KEY: "modules.dms-saas.config.stripe.secretKey",
    STRIPE_PUBLISHABLE_KEY: "modules.dms-saas.config.stripe.publishableKey",
    STRIPE_WEBHOOK_SECRET: "modules.dms-saas.config.stripe.webhookSecret",
  },
  modules: {
    "template-dms-demo": {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["pnpm install", "pnpm run build"],
        // Not `pnpm build`: it starts with `rimraf dist`, and the running module is loaded from dist.
        reloadCommand: ["pnpm exec tsc -p tsconfig.build.json"],
      },
    },

    // DMS modules stay below 1.0.0 so they all resolve on one interface-dms copy.
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: ">=0.3.7 <1.0.0",
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
        version: ">=0.1.3 <1.0.0",
      },
    },
    "dms-database": {
      source: {
        type: "package",
        package: "@antelopejs/dms-database",
        version: ">=0.0.6 <1.0.0",
      },
    },
    "dms-automation": {
      source: {
        type: "package",
        package: "@antelopejs/dms-automation",
        version: ">=0.1.5 <1.0.0",
      },
    },
    "dms-saas": {
      source: {
        type: "package",
        package: "@antelopejs/dms-saas",
        version: ">=0.1.8 <1.0.0",
      },
      config: {
        stripe: {
          secretKey: "sk_test_replace_me",
          publishableKey: "pk_test_replace_me",
          webhookSecret: "whsec_replace_me",
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
        version: ">=0.1.1 <1.0.0",
      },
      config: {
        // The sidecar runs on this host, so it reaches the API over loopback.
        backendUrl: "${@api.API_LOCAL_BASE_URL}",
        hostOrigin: CLIENT_BASE_URL,
      },
    },
    "dms-lang": {
      source: {
        type: "package",
        package: "@antelopejs/dms-lang",
        version: ">=0.0.4 <1.0.0",
      },
      config: {
        editable: true,
      },
    },
    "dms-builder": {
      source: {
        type: "package",
        package: "@antelopejs/dms-builder",
        version: ">=0.1.3 <1.0.0",
      },
    },
    "dms-media": {
      source: {
        type: "package",
        package: "@antelopejs/dms-media",
        version: ">=0.0.5 <1.0.0",
      },
    },
    "dms-marketing": {
      source: {
        type: "package",
        package: "@antelopejs/dms-marketing",
        version: ">=0.2.5 <1.0.0",
      },
    },
    "dms-mailing": {
      source: {
        type: "package",
        package: "@antelopejs/dms-mailing",
        version: ">=0.2.3 <1.0.0",
      },
    },

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
        // 1.3.0 publishes the API_* variables referenced above.
        version: "^1.3.0",
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
        version: "^0.1.5",
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
        version: "^0.0.5",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
