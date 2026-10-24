// The next step a signed quote gives its deal: plan the kick-off call. Stored
// as the quote's number (Deal.kickoffQuote) and worded for each reader: the
// pipeline's subline through the `$helio.crm.deals.kickoffNextStep` key, the
// deal's form and quick view, whose text field cannot hold a key, with the
// same sentence written here in the language of the reader's profile.

import { readerLanguage } from "../dashboard/locale";

const KICKOFF_STEP = {
  en: (number: string) => `Plan the kick-off call (quote ${number} signed)`,
  fr: (number: string) =>
    `Planifier l'appel de lancement (devis ${number} signé)`,
};

/** The kick-off next step of `quoteNumber`, in `language` (en by default). */
export function kickoffNextStep(
  quoteNumber: string,
  language: string | undefined,
): string {
  return KICKOFF_STEP[readerLanguage(language)](quoteNumber);
}

/**
 * Whether `text` is the kick-off next step of `quoteNumber` in a language
 * Helio writes in: a form sending it back unchanged has not typed a new one.
 */
export function isKickoffNextStep(
  text: unknown,
  quoteNumber: string | null | undefined,
): boolean {
  if (!quoteNumber || typeof text !== "string") return false;
  return Object.values(KICKOFF_STEP).some(
    (sentence) => sentence(quoteNumber) === text,
  );
}
