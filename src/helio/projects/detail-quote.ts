// The signed quote of a project, for its Quote tab: its facts, and its lines
// as the rows of a read-only source table.

import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { Tone } from "@antelopejs/interface-dms/base/types";
import type { Quote, QuoteStatus } from "../sales/database";
import { QUOTE_STATUSES } from "../sales/controller";
import { recordLink } from "./links";

const QUOTE_TONES: Record<QuoteStatus, Tone> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  rejected: "error",
  expired: "warning",
};

/** One line of the quote, as the lines table lists it. */
export interface QuoteLineRow {
  _id: string;
  label: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

const date = (value: Date | undefined) => value?.toISOString() ?? null;

export function quoteFacts(quote: Quote | undefined): KeyValueListItem[] {
  if (!quote) return [];
  const status = QUOTE_STATUSES.find((item) => item.value === quote.status);
  return [
    {
      id: "number",
      label: "$helio.projects.detail.quote.number",
      value: quote.number,
      type: "link",
      to: recordLink("quote", quote._id),
      copy: true,
    },
    {
      id: "status",
      label: "$helio.projects.detail.quote.status",
      value: status?.label ?? quote.status,
      type: "status",
      tone: QUOTE_TONES[quote.status],
    },
    {
      id: "issued",
      label: "$helio.projects.detail.quote.issuedAt",
      value: date(quote.issuedAt),
      type: "date",
    },
    {
      id: "signed",
      label: "$helio.projects.detail.quote.signedAt",
      value: date(quote.signedAt),
      type: "date",
    },
    {
      id: "subtotal",
      label: "$helio.projects.detail.quote.subtotal",
      value: quote.subtotal,
      type: "money",
    },
    {
      id: "vat",
      label: "$helio.projects.detail.quote.vat",
      value: {
        key: "$helio.projects.detail.quote.vatRate",
        params: {
          rate: { type: "number", value: quote.vatRate, format: "percent" },
        },
      },
    },
    {
      id: "total",
      label: "$helio.projects.detail.quote.total",
      value: quote.total,
      type: "money",
    },
  ];
}

export function quoteLines(quote: Quote | undefined): QuoteLineRow[] {
  return (quote?.lines ?? []).map((line, index) => ({
    _id: `${quote?._id ?? "quote"}-${index + 1}`,
    label: line.label,
    qty: line.qty,
    unitPrice: line.unitPrice,
    lineTotal: Math.round(line.qty * line.unitPrice * 100) / 100,
  }));
}
