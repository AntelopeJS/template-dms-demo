import assert from "node:assert";
import { describe, it } from "node:test";
import { STEPS } from "../provisioning";
import {
  pinSettingsRow,
  pinWebhookSecret,
  requireWebhookSecretRow,
  type SettingsRowQuery,
} from "./webhook-secret";

function recordingRow(
  found: unknown,
  updateAnswer: unknown = 1,
): { row: SettingsRowQuery; events: string[]; written: string[] } {
  const events: string[] = [];
  const written: string[] = [];
  const row: SettingsRowQuery = {
    run: () => {
      events.push("read");
      return Promise.resolve(found);
    },
    update: ({ webhookSecret }) => ({
      run: () => {
        events.push("write");
        written.push(webhookSecret);
        return Promise.resolve(updateAnswer);
      },
    }),
  };
  return { row, events, written };
}

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

void describe("pinSettingsRow", () => {
  void it("reads the row before it writes", async () => {
    const { row, events } = recordingRow({ webhookSecret: "old" });
    await pinSettingsRow(row);
    assert.deepStrictEqual(events, ["read", "write"]);
  });

  void it("writes exactly once, a 48 character hex secret, to a valid row", async () => {
    const { row, written } = recordingRow({ webhookSecret: "old" });
    await pinSettingsRow(row);
    assert.strictEqual(written.length, 1);
    assert.match(written[0] ?? "", /^[0-9a-f]{48}$/);
  });

  void it("rejects a missing row, a row without a string field and writes nothing", async () => {
    for (const found of [undefined, null, {}, { webhookSecret: 12 }, "text"]) {
      const { row, events } = recordingRow(found);
      await assert.rejects(pinSettingsRow(row), {
        name: "WebhookSecretPinError",
      });
      assert.deepStrictEqual(events, ["read"]);
    }
  });

  void it("does not reject when the write reports 0 changed rows", async () => {
    const { row, written } = recordingRow({ webhookSecret: "same" }, 0);
    await assert.doesNotReject(pinSettingsRow(row));
    assert.strictEqual(written.length, 1);
  });
});

void describe("provisioning steps", () => {
  const names = STEPS.map((step) => step.name);

  void it("runs the webhook secret pin as its own step", () => {
    assert.strictEqual(
      names.filter((name) => name === "mailing webhook secret").length,
      1,
    );
    const step = STEPS.find((entry) => entry.name === "mailing webhook secret");
    assert.strictEqual(step?.run, pinWebhookSecret);
  });

  void it("runs the pin after the mailing step", () => {
    assert.ok(names.includes("mailing"));
    assert.ok(
      names.indexOf("mailing webhook secret") > names.indexOf("mailing"),
    );
  });
});
