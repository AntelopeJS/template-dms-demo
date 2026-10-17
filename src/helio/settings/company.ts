// Helio's identity as its documents print it (quotes, invoices, e-mails),
// read from the company settings: one source of truth, so a change on the
// Settings page shows on the next quote or invoice. The defaults (defaults.ts)
// are the fictional company the demo starts with.

import { GetModel } from "@antelopejs/interface-database-decorators";
import { HelioSettingsModel } from "./database";
import { buildDefaultSettings } from "./defaults";
import {
  type CompanySettings,
  HELIO_SETTINGS_ID,
  type InvoicingSettings,
} from "./types";

/** The issuer block of a document, as printed. */
export interface CompanyIdentity {
  name: string;
  /** "Rue de l'Énergie 12" */
  street: string;
  /** "4040 Herstal" */
  city: string;
  country: string;
  /** "BE 0742.318.065" */
  vatNumber: string;
  /** "+32 4 220 50 50" */
  phone: string;
  email: string;
  /** "helio.example", without the scheme. */
  website: string;
  iban: string;
  bic: string;
}

type IdentitySource = Pick<
  CompanySettings,
  "companyName" | "vatNumber" | "address" | "phone" | "email" | "website"
> &
  Pick<InvoicingSettings, "iban" | "bic">;

// BE0742318065 → BE 0742.318.065, the way Belgian documents write it.
function formatVat(vat: string): string {
  const digits = vat.replace(/\D/g, "");
  if (!vat.toUpperCase().startsWith("BE") || digits.length !== 10) return vat;
  return `BE ${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`;
}

// +3242205050 → +32 4 220 50 50 (a Liège landline).
function formatPhone(phone: string): string {
  const match = /^\+32(\d)(\d{3})(\d{2})(\d{2})$/.exec(
    phone.replace(/\s/g, ""),
  );
  return match ? `+32 ${match.slice(1).join(" ")}` : phone;
}

/** The printed identity of a settings document. */
export function companyIdentity(source: IdentitySource): CompanyIdentity {
  const { address } = source;
  return {
    name: source.companyName,
    street: [address.streetName, address.houseNumber, address.boxNumber]
      .filter(Boolean)
      .join(" "),
    city: `${address.postalCode} ${address.city}`,
    country: address.countryCode === "BE" ? "Belgique" : address.countryCode,
    vatNumber: formatVat(source.vatNumber),
    phone: formatPhone(source.phone),
    email: source.email,
    website: source.website.replace(/^https?:\/\//, ""),
    iban: source.iban,
    bic: source.bic,
  };
}

/** The identity the demo starts with (the settings defaults). */
export const DEFAULT_COMPANY: CompanyIdentity = companyIdentity(
  buildDefaultSettings(),
);

/** The identity as currently saved on the Settings page. */
export async function readCompanyIdentity(): Promise<CompanyIdentity> {
  const stored = await GetModel(HelioSettingsModel).get(HELIO_SETTINGS_ID);
  return stored ? companyIdentity(stored) : DEFAULT_COMPANY;
}
