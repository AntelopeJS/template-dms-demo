import { Schema } from "@antelopejs/interface-database";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_NAME,
} from "@antelopejs/interface-dms/constants";
import { helioSecret } from "../../shared/clock";

const MAILING_SETTINGS_TABLE = "mailing_settings";

/** The one field of the module's settings row this file writes. */
interface MailingTables {
  [MAILING_SETTINGS_TABLE]: { _id: string; webhookSecret: string };
}

const WEBHOOK_SECRET_BYTES = 24;

/**
 * Replaces the webhook secret the Mailing module generated for the default
 * workspace with one derived from `HELIO_NOW`, so the settings page shows the
 * same last characters on every run. The module has no interface to set it,
 * so this writes its settings row, which the module has created by then (the
 * category declaration saves it). Without `HELIO_NOW` the module's random
 * secret stays.
 */
export async function pinWebhookSecret(): Promise<void> {
  if (!process.env.HELIO_NOW) return;
  await Schema.get<MailingTables>(TENANT_SCHEMA_NAME)
    ?.instance(DEFAULT_TENANT_ID)
    .table(MAILING_SETTINGS_TABLE)
    .get(DEFAULT_TENANT_ID)
    .update({
      webhookSecret: helioSecret("mailing-webhook", WEBHOOK_SECRET_BYTES),
    })
    .run();
}
