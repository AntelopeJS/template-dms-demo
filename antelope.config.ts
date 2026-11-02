import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { config as loadDotenv } from "dotenv";
import manifest from "./package.json";

loadDotenv({ path: resolve(__dirname, ".env") });

const devDependencies = new Map(Object.entries(manifest.devDependencies));

/**
 * A DMS module loads from the tarball package.json pins as a devDependency (the campaign pins), and from the registry
 * range otherwise. `swap-tgz.sh` removes the pin at release, so the registry range applies again without editing this file.
 */
function dmsModuleSource(name: string, version: string) {
  if (devDependencies.get(name)?.startsWith("file:"))
    return {
      type: "local" as const,
      path: resolve(__dirname, "node_modules", name),
    };
  return { type: "package" as const, package: name, version };
}

/**
 * The secret that hashes visitor ids, derived from `HELIO_NOW` when it is set so the imported traffic gets the same ids
 * on every run. Empty keeps the module's own generated secret.
 */
const visitorHashSecret = process.env.HELIO_NOW
  ? createHash("sha256")
      .update(`helio-secret:${process.env.HELIO_NOW}:marketing-visitor-hash`)
      .digest("hex")
  : "";

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
    /** Set by AntelopeJS Cloud (X-Client-IP): the header its gateway overwrites with the client address. */
    DMS_CLIENT_IP_HEADER: "modules.dms.config.auth.clientIpHeader",
    DMS_HTML_RENDER_SECRET: "modules.dms.config.htmlRender.serviceSecret",
    /** One secret signs and verifies the dashboard's tokens, so it feeds both modules. */
    JWT_SECRET: [
      "modules.dms.config.auth.jwtSecret",
      "modules.auth-jwt.config.secret",
    ],
    MONGODB_URL: "modules.mongodb.config.url",
    /** Where uploaded files live; a read-only container needs a writable path. */
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
  /**
   * Overrides applied by `ajs project build/start -e production`: dms refuses to start until
   * JWT_SECRET, DMS_HTML_RENDER_SECRET and DMS_CLIENT_BASE_URL are set.
   */
  environments: {
    production: {
      modules: {
        /** auth-jwt has no such check, so the public "dev" secret is blanked: never sign with it. */
        "auth-jwt": { config: { secret: "" } },
        /**
         * Ethereal creates an account over the internet at every start, so production turns it off
         * and sends through the SMTP relay SMTP_HOST names.
         */
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
        /** Not `pnpm build`: it starts with `rimraf dist`, and the running module is loaded from dist. */
        reloadCommand: ["pnpm exec tsc"],
      },
    },

    /** DMS modules stay below 1.0.0 so they all resolve on one interface-dms copy. */
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: ">=0.11.0 <1.0.0",
      },
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
          /** Generated in .antelope/dms-dev.json in development; set DMS_BOOTSTRAP_SECRET for builds. */
          bootstrapSecret: "",
        },
      },
    },
    "dms-api": {
      source: dmsModuleSource("@antelopejs/dms-api", ">=0.5.1 <1.0.0"),
    },
    "dms-database": {
      source: dmsModuleSource("@antelopejs/dms-database", ">=0.3.1 <1.0.0"),
    },
    "dms-automation": {
      source: dmsModuleSource("@antelopejs/dms-automation", ">=0.7.0 <1.0.0"),
    },
    "dms-saas": {
      source: dmsModuleSource("@antelopejs/dms-saas", ">=0.8.1 <1.0.0"),
      config: {
        stripe: {
          secretKey: "sk_test_placeholder",
          publishableKey: "pk_test_placeholder",
          webhookSecret: "whsec_placeholder",
        },
      },
    },
    "dms-ai": {
      source: dmsModuleSource("@antelopejs/dms-ai", ">=0.6.1 <1.0.0"),
      config: {
        /** The sidecar runs on this host, so it reaches the API over loopback. */
        backendUrl: "${@api.API_LOCAL_BASE_URL}",
      },
    },
    "dms-lang": {
      source: dmsModuleSource("@antelopejs/dms-lang", ">=0.4.1 <1.0.0"),
      config: {
        editable: true,
      },
    },
    "dms-builder": {
      source: dmsModuleSource("@antelopejs/dms-builder", ">=0.6.1 <1.0.0"),
    },
    "dms-media": {
      source: dmsModuleSource("@antelopejs/dms-media", ">=0.6.1 <1.0.0"),
    },
    "dms-marketing": {
      source: dmsModuleSource("@antelopejs/dms-marketing", ">=0.7.1 <1.0.0"),
      config: {
        visitorHashSecret,
        /** Tracks the dashboard itself, so Marketing shows how the demo is used. */
        dashboardTracking: {
          enabled: true,
          /** Draws the click heatmaps over snapshots of the dashboard pages. */
          snapshots: true,
        },
        /** Every visit records its clicks and scrolls, so the demo heatmaps fill quickly. */
        heatmapSampleRate: 1,
      },
    },
    "dms-mailing": {
      source: dmsModuleSource("@antelopejs/dms-mailing", ">=0.7.1 <1.0.0"),
    },

    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        /**
         * 1.4.4 (mongodb#54) resolves a single row's relations next to a
         * computed field: the products' edit form reads its range again. 1.5.0
         * enforces unique indexes, which dms-mailing's slug index needs.
         */
        version: "^1.5.0",
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
        /**
         * 1.3.0 publishes the API_* variables the config references; 1.3.3 ends open
         * connections on stop, so Ctrl+C does not wait for a dashboard tab;
         * 1.4.0 answers 503 until every module has started (core 1.17.0); 1.5.0
         * declares configVarsFile, which dms-frontend 0.9 reads at build.
         */
        version: "^1.5.0",
      },
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
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "^0.1.13",
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
