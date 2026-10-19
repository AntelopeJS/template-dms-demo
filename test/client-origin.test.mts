// The dashboard's origin comes from DMS_CLIENT_BASE_URL: the configuration
// builds the DMS base URL, the API's CORS and the OAuth redirect hosts from
// it, and production refuses to start without it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { assertClientBaseUrlSet } from "../src/client-origin.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Loaded in a child process: the configuration is evaluated once per process.
const LOAD = `
const { ConfigLoader } = require("@antelopejs/core");
const { access, readFile } = require("node:fs/promises");
const fs = {
  exists: (path) => access(path).then(() => true, () => false),
  readFileString: (path) => readFile(path, "utf8"),
};
new ConfigLoader(fs).load(process.cwd(), "production").then((config) => {
  const { dms, api } = config.modules;
  console.log(JSON.stringify({
    clientBaseUrl: dms.config.clientBaseUrl,
    corsOrigins: api.config.cors.allowedOrigins,
    redirectHosts: config.modules["dms-saas"].config.allowedRedirectHosts,
  }));
});
`;

function loadConfig(clientBaseUrl: string): Record<string, unknown> {
  const output = execFileSync(process.execPath, ["-e", LOAD], {
    cwd: ROOT,
    env: { ...process.env, DMS_CLIENT_BASE_URL: clientBaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.trim().split("\n").at(-1) ?? "");
}

void describe("the dashboard's origin", () => {
  void it("builds the base URL, CORS and redirect hosts from DMS_CLIENT_BASE_URL", () => {
    assert.deepEqual(loadConfig("https://dashboard.example.com:8443/"), {
      clientBaseUrl: "https://dashboard.example.com:8443",
      corsOrigins: ["https://dashboard.example.com:8443"],
      redirectHosts: ["dashboard.example.com:8443"],
    });
  });

  void it("keeps the development server's origins when it is unset", () => {
    assert.deepEqual(loadConfig(""), {
      clientBaseUrl: "http://localhost:3001",
      corsOrigins: ["http://localhost:3001", "http://127.0.0.1:3001"],
      redirectHosts: ["localhost:3001", "127.0.0.1:3001"],
    });
  });

  void it("refuses a value that is not an http(s) origin", () => {
    for (const value of [
      "dashboard.example.com",
      "ftp://dashboard.example.com",
      "https://dashboard.example.com/app",
      "https://dashboard.example.com/?next=/",
    ])
      assert.throws(
        () => loadConfig(value),
        /must be the dashboard's origin/,
        value,
      );
  });

  void it("is required to start in production", () => {
    assert.throws(
      () => assertClientBaseUrlSet({ DMS_CLIENT_BASE_URL: " " }),
      /DMS_CLIENT_BASE_URL is required in production/,
    );
    assert.doesNotThrow(() =>
      assertClientBaseUrlSet({
        DMS_CLIENT_BASE_URL: "https://dashboard.example.com",
      }),
    );
  });
});
