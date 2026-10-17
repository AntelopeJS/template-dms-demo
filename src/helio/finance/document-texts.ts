// Wording of the invoice document, in the reader's language. The document is
// a file the server writes, not a dashboard text: the frontend's i18n
// catalogs never reach it, so it carries its own two languages.

export interface DocumentTexts {
  locale: string;
  title: string;
  number: string;
  issuedAt: string;
  dueAt: string;
  billedTo: string;
  vatNumber: string;
  reference: string;
  project: string;
  quote: string;
  description: string;
  amountExcl: string;
  vat: string;
  total: string;
  paid: string;
  amountDue: string;
  paymentTitle: string;
  paymentLine: string;
  communication: string;
  paidStamp: string;
  cancelledStamp: string;
  draftStamp: string;
  paidOn: string;
  serviceLine: string;
  projectLine: string;
  legal: string;
  demo: string;
  methods: Record<string, string>;
}

const FR: DocumentTexts = {
  locale: "fr-BE",
  title: "Facture",
  number: "Numéro",
  issuedAt: "Date de facture",
  dueAt: "Échéance",
  billedTo: "Facturé à",
  vatNumber: "N° TVA",
  reference: "Références",
  project: "Chantier",
  quote: "Devis",
  description: "Description",
  amountExcl: "Montant HTVA",
  vat: "TVA",
  total: "Total TVAC",
  paid: "Déjà payé",
  amountDue: "Reste à payer",
  paymentTitle: "Paiement",
  paymentLine: "À verser avant le {date} sur le compte {iban} (BIC {bic}).",
  communication: "Communication structurée :",
  paidStamp: "Payée",
  cancelledStamp: "Annulée",
  draftStamp: "Brouillon",
  paidOn: "Payée le {date} par {method}.",
  serviceLine: "Prestations de service et contrat d'entretien",
  projectLine: "Installation — chantier {code}",
  legal:
    "Tout montant impayé à l'échéance porte de plein droit un intérêt de retard au taux légal et une indemnité forfaitaire de 40 €.",
  demo: "Document de démonstration : Helio est une entreprise fictive.",
  methods: {
    transfer: "virement",
    direct_debit: "domiciliation",
    card: "carte",
  },
};

const EN: DocumentTexts = {
  locale: "en-GB",
  title: "Invoice",
  number: "Number",
  issuedAt: "Invoice date",
  dueAt: "Due date",
  billedTo: "Billed to",
  vatNumber: "VAT no.",
  reference: "References",
  project: "Project",
  quote: "Quote",
  description: "Description",
  amountExcl: "Amount excl. VAT",
  vat: "VAT",
  total: "Total incl. VAT",
  paid: "Already paid",
  amountDue: "Amount due",
  paymentTitle: "Payment",
  paymentLine: "Please pay by {date} to account {iban} (BIC {bic}).",
  communication: "Structured reference:",
  paidStamp: "Paid",
  cancelledStamp: "Cancelled",
  draftStamp: "Draft",
  paidOn: "Paid on {date} by {method}.",
  serviceLine: "Services and maintenance contract",
  projectLine: "Installation — project {code}",
  legal:
    "Any amount unpaid at the due date bears late-payment interest at the statutory rate and a fixed indemnity of €40.",
  demo: "Demonstration document: Helio is a fictional company.",
  methods: {
    transfer: "bank transfer",
    direct_debit: "direct debit",
    card: "card",
  },
};

/** The texts for a user language ("fr", "fr-FR", "en-GB"…); English otherwise. */
export function documentTexts(language: string | undefined): DocumentTexts {
  return language?.toLowerCase().startsWith("fr") ? FR : EN;
}

/** The fictional company issuing the invoices. */
export const ISSUER = {
  name: "Helio SRL",
  street: "Quai de la Boverie 12",
  city: "4020 Liège",
  country: "Belgique",
  vatNumber: "BE0789.456.123",
  email: "billing@helio.example",
  phone: "+32 4 123 45 67",
  iban: "BE68 5390 0754 7034",
  bic: "HELIBEBB",
};
