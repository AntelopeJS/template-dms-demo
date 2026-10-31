import assert from "node:assert";
import { describe, it } from "node:test";
import { pinWebhookSecret, requireWebhookSecretRow } from "./webhook-secret";

void describe("requireWebhookSecretRow", () => {
  void it("accepts a row with a string webhookSecret", () => {
    assert.doesNotThrow(() =>
      requireWebhookSecretRow({ _id: "default", webhookSecret: "abc" }),
    );
  });

  void it("names a missing row", () => {
    for (const row of [null, undefined]) {
      assert.throws(() => requireWebhookSecretRow(row), {
        name: "WebhookSecretPinError",
        message: /has no row/,
      });
    }
  });

  void it("names a row without a string webhookSecret", () => {
    for (const row of [{}, { _id: "default" }, { webhookSecret: 12 }, "text"]) {
      assert.throws(() => requireWebhookSecretRow(row), {
        name: "WebhookSecretPinError",
        message: /no string "webhookSecret"/,
      });
    }
  });
});

void describe("pinWebhookSecret", () => {
  void it("leaves the module's secret alone without HELIO_NOW", async () => {
    const { HELIO_NOW: previous } = process.env;
    delete process.env.HELIO_NOW;
    try {
      await assert.doesNotReject(pinWebhookSecret());
    } finally {
      if (previous !== undefined) process.env.HELIO_NOW = previous;
    }
  });

  void it("throws a named error under HELIO_NOW when the tenant schema is not defined", async () => {
    const { HELIO_NOW: previous } = process.env;
    process.env.HELIO_NOW = "2026-06-15T09:00:00Z";
    try {
      await assert.rejects(pinWebhookSecret(), {
        name: "WebhookSecretPinError",
        message: /is not defined/,
      });
    } finally {
      if (previous === undefined) delete process.env.HELIO_NOW;
      else process.env.HELIO_NOW = previous;
    }
  });
});
