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
  // TEMPORARY: exact prerelease pin, not a range -- a `>=x <1.0.0` range never
  // matches a prerelease. This release consumes the api config variables and
  // forwards them to its sidecar. Restore a range once 0.1.1 ships as stable.
  "@antelopejs/dms-ai": "0.1.1-next.0",
  "@antelopejs/dms-lang": ">=0.0.4 <1.0.0",
  "@antelopejs/dms-builder": ">=0.1.3 <1.0.0",
  "@antelopejs/dms-media": ">=0.0.5 <1.0.0",
  "@antelopejs/dms-marketing": ">=0.2.5 <1.0.0",
  "@antelopejs/dms-mailing": ">=0.2.3 <1.0.0",
};

// Port the API server prefers. This is the only port literal in this file: the
// api module publishes the port it actually reserved as `API_PORT`, and the
// origins built from it as `API_LOCAL_BASE_URL` / `API_PUBLIC_BASE_URL`. Every
// other module below references those published values instead of rebuilding a
// URL of its own, so the reserved port and the minted URLs can never drift.
// `DMS_API_PORT` is optional and documented in the README environment table.
// Neither goes through `envOverrides` below: the port lives inside the
// `servers` array and the core's override writer only walks plain objects.
//
// `PORT` comes from Amp, which declares the port in .amp/services.yaml and
// exposes and health-checks exactly that number. The api must not drift off
// it, so a declared port also turns on `strictPort`: a busy port then fails
// the boot loudly instead of silently landing on a port the gateway could
// never follow. Without a declared port the development fallback stays on and
// two checkouts can run side by side.
const DECLARED_API_PORT = process.env.PORT;
const PREFERRED_API_PORT = Number(
  DECLARED_API_PORT ?? process.env.DMS_API_PORT ?? 5010,
);

// Origin of the dashboard frontend. `ajs dms dev` is a separate process, not an
// Antelope module, so nothing can publish it as a config variable: it stays an
// explicit constant and the CORS list and the redirect allowlist derive from
// it. `localhost` and `127.0.0.1` are distinct browser origins, so both forms
// are allowed.
const CLIENT_PORT = Number(process.env.DMS_CLIENT_PORT ?? 3001);
const CLIENT_ORIGINS = ["localhost", "127.0.0.1"].map(
  (host) => `http://${host}:${CLIENT_PORT}`,
);
const CLIENT_BASE_URL = process.env.DMS_CLIENT_BASE_URL ?? CLIENT_ORIGINS[0];
const CLIENT_ORIGIN_SET = [...new Set([...CLIENT_ORIGINS, CLIENT_BASE_URL])];

export default defineConfig({
  name: "template-dms-demo",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  // Map environment variables (loaded from .env) onto module config paths.
  envOverrides: {
    // The public origin browsers must use to reach the API. Optional in
    // development, where the api module falls back to its local origin;
    // required anywhere else, or the boot fails with an explicit message.
    DMS_API_PUBLIC_BASE_URL: "modules.api.config.publicBaseUrl",
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
        // Published by the api module from the port it actually reserved.
        // PUBLIC, not LOCAL: the dashboard runs in a browser and the same URL
        // ends up in generated e-mails.
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
        // Stripe return URLs point back at the dashboard, never at the API,
        // so this list derives from the client origins. The module matches on
        // `host:port` without a scheme, which is why it cannot consume the
        // origin-shaped `API_PUBLIC_BASE_URL` directly.
        allowedRedirectHosts: CLIENT_ORIGIN_SET.map(
          (origin) => new URL(origin).host,
        ),
      },
    },
    "dms-ai": {
      source: {
        type: "package",
        package: "@antelopejs/dms-ai",
        version: DMS_VERSIONS["@antelopejs/dms-ai"],
      },
      config: {
        // LOCAL: the sidecar is a child process on this host, so it must talk
        // to the API over loopback rather than through a public origin.
        backendUrl: "${@api.API_LOCAL_BASE_URL}",
        // The dashboard origin the sidecar renders against. Not an Antelope
        // module, so it stays the explicit client constant (see above).
        hostOrigin: CLIENT_BASE_URL,
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
        // TEMPORARY: first release publishing the API_PORT /
        // API_LOCAL_BASE_URL / API_PUBLIC_BASE_URL config variables. Move back
        // to a caret range once 1.3.0 ships as stable.
        version: "1.3.0-next.0",
      },
      config: {
        servers: [
          {
            protocol: "http",
            port: PREFERRED_API_PORT,
          },
        ],
        strictPort: DECLARED_API_PORT !== undefined,
        cors: {
          // Browser origins allowed to call this API. These are the origins
          // the dashboard is served from, so they derive from the client
          // constants above, not from the api variables: a module cannot
          // reference its own published values, that is a resolution cycle.
          // `DMS_GATEWAY_URL` is the single-origin dev gateway (see .amp).
          allowedOrigins: [
            ...CLIENT_ORIGIN_SET,
            ...(process.env.DMS_GATEWAY_URL
              ? [process.env.DMS_GATEWAY_URL]
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
        // PUBLIC: this is the base of every asset and presigned URL handed to
        // a browser, so it must be the origin external clients can reach.
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
