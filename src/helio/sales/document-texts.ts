// The words of the quote document. It is drawn on the server, outside the
// dashboard's i18n, in the reader's language: French (Helio's customers are
// mostly French-speaking Belgians) or English.

export type DocumentLanguage = "fr" | "en";

export interface DocumentTexts {
  locale: string;
  title: string;
  tagline: string;
  customer: string;
  vat: string;
  issuedAt: string;
  validUntil: string;
  subject: string;
  noSubject: string;
  columns: {
    ref: string;
    description: string;
    qty: string;
    unitPrice: string;
    total: string;
  };
  subtotal: string;
  vatLine: (rate: string) => string;
  grandTotal: string;
  terms: string;
  termLines: (validUntil: string, residential: boolean) => string[];
  approval: string;
  approvalHint: string;
  signedOn: (date: string) => string;
  page: (index: number, count: number) => string;
  continued: string;
}

const FR: DocumentTexts = {
  locale: "fr-BE",
  title: "DEVIS",
  tagline: "Panneaux solaires · Batteries · Bornes de recharge",
  customer: "CLIENT",
  vat: "TVA",
  issuedAt: "Date d'émission",
  validUntil: "Valable jusqu'au",
  subject: "Objet",
  noSubject: "Installation et fourniture",
  columns: {
    ref: "Réf.",
    description: "Désignation",
    qty: "Qté",
    unitPrice: "Prix unit. HTVA",
    total: "Total HTVA",
  },
  subtotal: "Sous-total HTVA",
  vatLine: (rate) => `TVA ${rate}`,
  grandTotal: "Total TVAC",
  terms: "Conditions",
  termLines: (validUntil, residential) => [
    `Offre valable jusqu'au ${validUntil}, prix en euros.`,
    "Acompte de 30 % à la commande, solde à la réception de l'installation.",
    residential
      ? "TVA à 6 % : habitation de plus de 10 ans, attestation à signer par le client."
      : "Autoliquidation non applicable : TVA à 21 % facturée.",
    "Garantie de pose de 10 ans, garanties fabricant selon les fiches produits.",
  ],
  approval: "Bon pour accord",
  approvalHint: "Date, nom et signature du client",
  signedOn: (date) => `Accepté le ${date}`,
  page: (index, count) => `Page ${index} sur ${count}`,
  continued: "Suite du devis",
};

const EN: DocumentTexts = {
  locale: "en-GB",
  title: "QUOTE",
  tagline: "Solar panels · Batteries · EV chargers",
  customer: "CUSTOMER",
  vat: "VAT",
  issuedAt: "Issued",
  validUntil: "Valid until",
  subject: "Subject",
  noSubject: "Supply and installation",
  columns: {
    ref: "Ref.",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit price excl. VAT",
    total: "Total excl. VAT",
  },
  subtotal: "Subtotal excl. VAT",
  vatLine: (rate) => `VAT ${rate}`,
  grandTotal: "Total incl. VAT",
  terms: "Terms",
  termLines: (validUntil, residential) => [
    `Offer valid until ${validUntil}, prices in euros.`,
    "30% deposit on order, balance on acceptance of the installation.",
    residential
      ? "6% VAT: home over 10 years old, certificate to be signed by the customer."
      : "No reverse charge: 21% VAT invoiced.",
    "10-year installation warranty, manufacturer warranties as per product sheets.",
  ],
  approval: "Approved",
  approvalHint: "Date, name and signature of the customer",
  signedOn: (date) => `Accepted on ${date}`,
  page: (index, count) => `Page ${index} of ${count}`,
  continued: "Quote, continued",
};

/** French unless the reader's browser asks for English first. */
export function documentLanguage(acceptLanguage: string | undefined) {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase();
  return first?.startsWith("en") ? "en" : "fr";
}

export function documentTexts(language: DocumentLanguage): DocumentTexts {
  return language === "en" ? EN : FR;
}

/** Helio's own details, printed on every quote (a fictional company). */
export const HELIO_COMPANY = {
  name: "Helio SRL",
  street: "Quai de Rome 25",
  city: "4000 Liège",
  vatNumber: "BE 0712.345.678",
  phone: "+32 4 222 18 40",
  email: "devis@helio.example",
  website: "helio.example",
  iban: "BE68 5390 0754 7034",
};
