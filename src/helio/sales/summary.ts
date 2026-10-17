// What the expanded row of a quote says about its lines: the first three,
// then the rest in one entry. A band of label/value pairs draws one line of
// text per field, so the lines are spread over fixed fields.

import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import type { QuoteLine } from "./database";
import { linesSubtotal } from "./lines";

/** The lines shown one by one before the rest is summed up. */
export const SHOWN_LINES = 3;

function money(amount: number) {
  return {
    type: "money",
    value: Math.round(amount * 100),
    currency: "EUR",
  } as const;
}

/** "12 × Helio Mono 410 W · €2,268.00", or null past the last line. */
export function lineText(
  lines: readonly QuoteLine[] | undefined,
  index: number,
): ComposedText | null {
  const line = lines?.[index];
  if (!line) return null;
  return {
    key: "$helio.sales.quotes.expand.line",
    params: {
      qty: { type: "number", value: line.qty },
      label: line.label,
      amount: money(line.qty * line.unitPrice),
    },
  };
}

/** The line after the shown ones, or how many follow and what they add up to. */
export function otherLinesText(
  lines: readonly QuoteLine[] | undefined,
): ComposedText | null {
  const rest = (lines ?? []).slice(SHOWN_LINES);
  if (rest.length <= 1) return lineText(rest, 0);
  return {
    key: "$helio.sales.quotes.expand.more",
    params: {
      count: { type: "count", value: rest.length },
      amount: money(linesSubtotal(rest)),
    },
  };
}
