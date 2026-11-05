import assert from "node:assert";
import { describe, it } from "node:test";
import { captureEnvironment } from "./capture-environment";

void describe("the capture environment", () => {
  void it("fixes the instant, the zone, the simulators, the token and the backend host", () => {
    const environment = captureEnvironment({});
    assert.deepStrictEqual(
      [
        environment.HELIO_NOW,
        environment.TZ,
        environment.HELIO_SIMULATORS,
        environment.DMS_SETUP_TOKEN,
        environment.HELIO_API_HOST,
        environment.PORT,
        environment.DMS_CLIENT_BASE_URL,
      ],
      [
        "2026-06-15T09:00:00Z",
        "UTC",
        "off",
        "helio-capture-setup-token",
        "127.0.0.1",
        "3001",
        "http://localhost:3001",
      ],
    );
  });

  void it("keeps a token the caller set", () => {
    assert.strictEqual(
      captureEnvironment({ DMS_SETUP_TOKEN: "my-own-setup-token" })
        .DMS_SETUP_TOKEN,
      "my-own-setup-token",
    );
  });

  void it("treats an empty or blank token as unset", () => {
    for (const blank of ["", "   "])
      assert.strictEqual(
        captureEnvironment({ DMS_SETUP_TOKEN: blank }).DMS_SETUP_TOKEN,
        "helio-capture-setup-token",
      );
  });

  void it("follows the port in the client base URL and keeps what the caller set", () => {
    assert.strictEqual(
      captureEnvironment({ PORT: "3211" }).DMS_CLIENT_BASE_URL,
      "http://localhost:3211",
    );
    const set = captureEnvironment({
      DMS_CLIENT_BASE_URL: "http://example.test",
      HELIO_API_HOST: "0.0.0.0",
      HELIO_NOW: "2026-01-01T00:00:00Z",
    });
    assert.deepStrictEqual(
      [set.DMS_CLIENT_BASE_URL, set.HELIO_API_HOST, set.HELIO_NOW],
      ["http://example.test", "0.0.0.0", "2026-01-01T00:00:00Z"],
    );
  });
});
