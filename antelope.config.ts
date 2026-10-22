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
  envOverrides: {
    DMS_API_PUBLIC_BASE_URL: "modules.api.config.publicBaseUrl",
    DMS_BOOTSTRAP_SECRET: "modules.dms.config.frontend.bootstrapSecret",
    DMS_CLIENT_BASE_URL: "modules.dms.config.clientBaseUrl",
    // Set by AntelopeJS Cloud (X-Client-IP): the header its gateway overwrites with the client address.
    DMS_CLIENT_IP_HEADER: "modules.dms.config.auth.clientIpHeader",
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
  // `ajs project build/start -e production`: dms refuses to start until
  // JWT_SECRET, DMS_HTML_RENDER_SECRET and DMS_CLIENT_BASE_URL are set.
  environments: {
    production: {
      modules: {
        // auth-jwt has no such check: never sign with the public "dev" secret.
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
    },

    // DMS modules stay below 1.0.0 so they all resolve on one interface-dms copy.
    dms: {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms" },
      config: {
        apiBaseUrl: "${@api.API_PUBLIC_BASE_URL}",
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
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-api" },
    },
    "dms-database": {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-database" },
    },
    "dms-automation": {
      // af/integration: the packed module vendored in vendor/.
      source: {
        type: "local",
        path: "node_modules/@antelopejs/dms-automation",
      },
    },
    "dms-saas": {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-saas" },
      config: {
        stripe: {
          secretKey: "sk_test_replace_me",
          publishableKey: "pk_test_replace_me",
          webhookSecret: "whsec_replace_me",
        },
      },
    },
    "dms-ai": {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-ai" },
      config: {
        // The sidecar runs on this host, so it reaches the API over loopback.
        backendUrl: "${@api.API_LOCAL_BASE_URL}",
      },
    },
    "dms-lang": {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-lang" },
      config: {
        editable: true,
      },
    },
    "dms-builder": {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-builder" },
    },
    "dms-media": {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-media" },
    },
    "dms-marketing": {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-marketing" },
    },
    "dms-mailing": {
      // af/integration: the packed module vendored in vendor/.
      source: { type: "local", path: "node_modules/@antelopejs/dms-mailing" },
    },

    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.4.3",
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
      // af/integration: the packed module vendored in vendor/ (startup gate, AF·01).
      source: { type: "local", path: "node_modules/@antelopejs/api" },
      config: {
        servers: [
          {
            protocol: "http",
            port: 5010,
          },
        ],
      },
    },
    "file-storage-local": {
      // af/integration: exactly 0.1.9 through the root lockfile. 0.1.10/0.1.11
      // need interface-api 0.0.16, and a fresh 0.1.9 install alone picks up
      // interface-file-storage 0.1.5, whose writeFile 0.1.9 does not implement.
      source: {
        type: "local",
        path: "node_modules/@antelopejs/file-storage-local",
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
