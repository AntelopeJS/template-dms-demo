// Numbers of new quotes follow the quote pattern of the Settings page
// (Q-{YYYY}-{SEQ:4} by default), following on from the last number used.
//
// The data API writes a new row synchronously (setters cannot await), so the
// pattern and the numbers used are read from the database beforehand, by the
// table's `new` guard, then kept in step here by every creation.

import { GetModel } from "@antelopejs/interface-database-decorators";
import { currentSettings } from "../settings/current";
import { nextNumber } from "../settings/number-pattern";
import { QuoteModel } from "./database";

const DEFAULT_PATTERN = "Q-{YYYY}-{SEQ:4}";

let pattern: string | undefined;
const used = new Set<string>();

/**
 * Reads the quote pattern and the numbers already used. Run before every
 * creation, so a pattern changed on the Settings page applies to the next
 * quote; a number taken since the read stays known.
 */
export async function loadQuoteNumbers(): Promise<void> {
  const [settings, quotes] = await Promise.all([
    currentSettings(),
    GetModel(QuoteModel).getAll(),
  ]);
  pattern = settings.quoteNumberPattern;
  for (const { number } of quotes) if (number) used.add(number);
}

/** Takes the next number the pattern gives on `issuedAt`. */
export function takeQuoteNumber(issuedAt: Date): string {
  if (pattern === undefined) {
    // The `new` guard loads them first: reaching here without it would
    // hand out a number already used.
    throw new Error("Quote numbers were not loaded before the creation");
  }
  const number = nextNumber(pattern, issuedAt, used, DEFAULT_PATTERN);
  used.add(number);
  return number;
}
