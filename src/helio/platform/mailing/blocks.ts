// Small builders for the blocks of the Helio templates. Every block gets an
// explicit, stable id: the Mailing module fingerprints a declaration to tell
// "unchanged" from "updated", so generated ids would republish on each boot.

import type {
  Block,
  ButtonBlock,
  Condition,
  FooterBlock,
  HeadingBlock,
  LocaleContent,
  ParagraphBlock,
  TotalBlock,
  VariableDefinition,
  VariableType,
} from "@antelopejs/interface-dms-mailing";
import type { MailLocale } from "./format";

const HEADING_SIZE = 22;

export function heading(id: string, text: string): HeadingBlock {
  return {
    id,
    type: "heading",
    text,
    align: "left",
    size: HEADING_SIZE,
    visibleIf: null,
  };
}

export function paragraph(
  id: string,
  text: string,
  visibleIf: Condition | null = null,
): ParagraphBlock {
  return { id, type: "paragraph", text, align: "left", visibleIf };
}

/** A label and its value on one line: the key facts of the e-mail. */
export function fact(id: string, label: string, value: string): TotalBlock {
  return { id, type: "total", label, value, visibleIf: null };
}

export function button(id: string, text: string, href: string): ButtonBlock {
  return { id, type: "button", text, href, align: "left", visibleIf: null };
}

const FOOTER_TEXT: Record<MailLocale, string> = {
  fr: "Helio SRL · Rue de l'Énergie 12, 4040 Herstal · TVA BE0742.318.065 · Vous recevez cet e-mail dans le cadre de votre installation Helio.",
  en: "Helio SRL · Rue de l'Énergie 12, 4040 Herstal · VAT BE0742.318.065 · You receive this e-mail about your Helio installation.",
};

// Transactional e-mails: the footer says why it was sent, and carries no
// unsubscribe link (the Mailing module only requires one for marketing).
function footer(locale: MailLocale): FooterBlock {
  return {
    id: "footer",
    type: "footer",
    text: FOOTER_TEXT[locale],
    unsubscribeLabel: "",
    preferencesLabel: "",
    visibleIf: null,
  };
}

/** One locale of a template: its blocks, then the Helio footer. */
export function localeContent(
  locale: MailLocale,
  subject: string,
  preheader: string,
  blocks: Block[],
): LocaleContent {
  return { subject, preheader, blocks: [...blocks, footer(locale)] };
}

/** A required variable of the given type. */
export function variable(path: string, type: VariableType): VariableDefinition {
  return { path, type, required: true };
}
