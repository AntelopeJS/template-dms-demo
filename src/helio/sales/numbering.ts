// Numbers of new quotes: Q-<year>-<4 digits>, following on from the last
// number used in the year of issue.
//
// The data API writes a new row synchronously (setters cannot await), so the
// last numbers are read from the database beforehand, by the table's `new`
// guard, then kept in step here by every creation. The module is evaluated
// again on each backend reload, which reads them afresh.

import { GetModel } from "@antelopejs/interface-database-decorators";
import { QuoteModel } from "./database";

const NUMBER_PATTERN = /^Q-(\d{4})-(\d+)$/;

let lastByYear: Map<number, number> | undefined;
let loading: Promise<void> | undefined;

async function readLastNumbers(): Promise<void> {
  const quotes = await GetModel(QuoteModel).getAll();
  const last = new Map<number, number>();
  for (const { number } of quotes) {
    const match = NUMBER_PATTERN.exec(number ?? "");
    if (!match) continue;
    const year = Number(match[1]);
    last.set(year, Math.max(last.get(year) ?? 0, Number(match[2])));
  }
  lastByYear = last;
}

/** Reads the last number of each year once; later calls return at once. */
export function loadQuoteNumbers(): Promise<void> {
  if (lastByYear) return Promise.resolve();
  loading ??= readLastNumbers().finally(() => {
    loading = undefined;
  });
  return loading;
}

/** Takes the next number of the year `issuedAt` falls in. */
export function takeQuoteNumber(issuedAt: Date): string {
  if (!lastByYear) {
    // The `new` guard loads them first: reaching here without it would
    // hand out a number already used.
    throw new Error("Quote numbers were not loaded before the creation");
  }
  const year = issuedAt.getFullYear();
  const next = (lastByYear.get(year) ?? 0) + 1;
  lastByYear.set(year, next);
  return `Q-${year}-${String(next).padStart(4, "0")}`;
}
