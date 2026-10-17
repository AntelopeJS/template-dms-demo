import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  formSchema,
  type FormFieldOrGroup,
} from "@antelopejs/interface-dms/base/form";
import { TeamMemberModel } from "../team/database";
import { HelioSettingsModel } from "./database";
import { buildDefaultSettings, generateApiKey } from "./defaults";
import {
  HELIO_SETTINGS_ID,
  type HelioSettingsValues,
  type ToggleableValue,
} from "./types";
import { isValidVatNumber, normalizeVatNumber } from "./vat";

const HTTP_BAD_REQUEST = 400;

// Values the form shows but only the server writes: the enterprise number is
// fixed, the API key changes through its rotate route, and the monitoring
// endpoint is issued by the platform. A save body naming them is ignored.
const SERVER_OWNED = [
  "_id",
  "enterpriseNumber",
  "apiKey",
  "monitoringEndpoint",
];

/** The team member a relation field shows: the row it references, joined. */
interface TechnicianRef {
  _id: string;
  name: string;
  avatar?: string;
}

/**
 * What the settings forms load: the document without its write-only secret,
 * the default technician joined like a table's relation column, so the picker
 * shows the name before its list is ever opened.
 */
export type SettingsFormValues = Omit<
  HelioSettingsValues,
  "smtpPassword" | "defaultTechnician"
> & { defaultTechnician: TechnicianRef | string | null };

function settingsModel(): HelioSettingsModel {
  return GetModel(HelioSettingsModel);
}

// The fixture seeds the document; a dropped collection gets it back on the
// next read instead of answering an empty form.
async function readStored(): Promise<HelioSettingsValues> {
  const model = settingsModel();
  const stored = await model.get(HELIO_SETTINGS_ID);
  if (stored) return stored;
  const defaults = buildDefaultSettings();
  await model.insert(defaults);
  return defaults;
}

// The whole row is written back, so a field the body does not name keeps its
// stored value whatever the model's update does with absent keys.
async function writeStored(values: HelioSettingsValues): Promise<void> {
  const { _id, ...rest } = values;
  await settingsModel().update(_id, rest);
}

async function joinTechnician(
  id: string | null,
): Promise<TechnicianRef | string | null> {
  if (!id) return null;
  const member = await GetModel(TeamMemberModel).get(id);
  // A member removed since keeps its id: the picker shows it as is.
  if (!member) return id;
  return { _id: member._id, name: member.name, avatar: member.avatar };
}

async function toFormValues(
  values: HelioSettingsValues,
): Promise<SettingsFormValues> {
  const { smtpPassword: _secret, defaultTechnician, ...served } = values;
  return {
    ...served,
    defaultTechnician: await joinTechnician(defaultTechnician),
  };
}

/**
 * Validates a partial save against the forms' own fields: a key absent is
 * left unchanged, `null` clears a field that is not required.
 */
function parseChanges(
  body: Record<string, unknown>,
  entries: FormFieldOrGroup[],
): Partial<HelioSettingsValues> {
  const writable = Object.fromEntries(
    Object.entries(body).filter(([key]) => !SERVER_OWNED.includes(key)),
  );
  const result = formSchema(entries).partial().safeParse(writable);
  // Same answer as interface-api-util's assertValidation: the form reads the
  // zod issues and puts each under its field.
  if (!result.success)
    throw new HTTPResult(HTTP_BAD_REQUEST, String(result.error));
  return result.data;
}

// Stored the way VIES writes it (BE0123456789); anything that is not an EU
// VAT number is refused under the field.
function checkVatNumber(changes: Partial<HelioSettingsValues>): void {
  if (typeof changes.vatNumber !== "string") return;
  const normalized = normalizeVatNumber(changes.vatNumber);
  if (!isValidVatNumber(normalized)) {
    throw new HTTPResult(HTTP_BAD_REQUEST, {
      message: "$helio.settings.errors.vatNumber",
      field: "vatNumber",
    });
  }
  changes.vatNumber = normalized;
}

// The header list keeps a blank row for the next entry: a header without a
// name is that row, not a header to send.
function withoutBlankHeaders(
  headers: Record<string, ToggleableValue>,
): Record<string, ToggleableValue> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.trim() !== ""),
  );
}

export async function readSettings(): Promise<SettingsFormValues> {
  return toFormValues(await readStored());
}

/** Applies a save of the settings forms; answers every value, as loaded. */
export async function saveSettings(
  body: Record<string, unknown>,
  entries: FormFieldOrGroup[],
): Promise<SettingsFormValues> {
  const changes = parseChanges(body, entries);
  // An emptied password field means "keep the current one", not "remove it".
  if (!changes.smtpPassword) delete changes.smtpPassword;
  checkVatNumber(changes);
  if (changes.webhookHeaders)
    changes.webhookHeaders = withoutBlankHeaders(changes.webhookHeaders);
  const merged: HelioSettingsValues = { ...(await readStored()), ...changes };
  await writeStored(merged);
  return toFormValues(merged);
}

/** Issues a new API key; the previous one stops working at once. */
export async function rotateApiKey(): Promise<{ value: string }> {
  const value = generateApiKey();
  await writeStored({ ...(await readStored()), apiKey: value });
  return { value };
}

/**
 * Puts every setting back to Helio's defaults. Credentials survive: the API
 * key and the SMTP password keep integrations running through a reset.
 */
export async function resetSettings(): Promise<{ ok: true }> {
  const stored = await readStored();
  await writeStored({
    ...buildDefaultSettings(),
    apiKey: stored.apiKey,
    smtpPassword: stored.smtpPassword,
  });
  return { ok: true };
}

/** The company name, typed to confirm the reset. */
export async function readCompanyName(): Promise<string> {
  return (await readStored()).companyName;
}
