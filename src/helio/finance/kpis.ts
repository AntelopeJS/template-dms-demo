// The figures above the invoice list: what customers still owe, what is late,
// what came in this month and how long payment takes (DSO). Computed from the
// stored invoices on every read, so they follow each payment recorded.

import { GetModel } from "@antelopejs/interface-database-decorators";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import type { ComposedText } from "@antelopejs/interface-dms/base/types/composed-text";
import { DAY_MS } from "../shared/seed";
import { type Invoice, InvoiceModel } from "./database";

/** Window of the DSO: receivables over the sales of the last 90 days. */
const DSO_WINDOW_DAYS = 90;
const NOT_BILLED: readonly string[] = ["draft", "cancelled"];

/** Where the cells lead: tabs and views of the invoice table. */
export interface KpiLinks {
  overdue: string;
  sent: string;
  paid: string;
}

const money = (euros: number): ComposedText => ({
  key: "$helio.finance.kpis.amount",
  params: {
    amount: { type: "money", value: Math.round(euros * 100), currency: "EUR" },
  },
});

const sum = (invoices: Invoice[], pick: (invoice: Invoice) => number) =>
  invoices.reduce((total, invoice) => total + pick(invoice), 0);

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));

function startOfMonth(): Date {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function outstandingCell(invoices: Invoice[], to: string): StatGroupItem {
  const open = invoices.filter((invoice) =>
    ["sent", "overdue"].includes(invoice.status),
  );
  return {
    id: "outstanding",
    icon: "i-ph-hourglass-medium",
    tone: "info",
    eyebrow: "$helio.finance.kpis.outstanding.label",
    value: money(sum(open, (invoice) => invoice.amountDue)),
    detail: {
      key: "$helio.finance.kpis.outstanding.detail",
      params: { count: { type: "count", value: open.length } },
    },
    to,
  };
}

function overdueCell(invoices: Invoice[], to: string): StatGroupItem {
  const late = invoices.filter((invoice) => invoice.status === "overdue");
  const now = new Date();
  const oldest = late.reduce(
    (days, invoice) => Math.max(days, daysBetween(invoice.dueAt, now)),
    0,
  );
  return {
    id: "overdue",
    icon: "i-ph-warning-circle",
    tone: late.length > 0 ? "error" : "success",
    eyebrow: "$helio.finance.kpis.overdue.label",
    value: money(sum(late, (invoice) => invoice.amountDue)),
    detail:
      late.length > 0
        ? {
            key: "$helio.finance.kpis.overdue.detail",
            params: {
              count: { type: "count", value: late.length },
              days: { type: "number", value: oldest },
            },
          }
        : "$helio.finance.kpis.overdue.none",
    detailTone: late.length > 0 ? "error" : "success",
    to,
  };
}

function collectedCell(invoices: Invoice[], to: string): StatGroupItem {
  const since = startOfMonth();
  const paid = invoices.filter(
    (invoice) =>
      invoice.status === "paid" &&
      !!invoice.paidAt &&
      invoice.paidAt.getTime() >= since.getTime(),
  );
  return {
    id: "collected",
    icon: "i-ph-hand-coins",
    tone: "success",
    eyebrow: "$helio.finance.kpis.collected.label",
    value: money(sum(paid, (invoice) => invoice.total)),
    detail: {
      key: "$helio.finance.kpis.collected.detail",
      params: { count: { type: "count", value: paid.length } },
    },
    to,
  };
}

// DSO = receivables / sales of the window × days of the window. The detail
// gives the plain average: days between issue and payment, recently.
function dsoCell(invoices: Invoice[]): StatGroupItem {
  const now = new Date();
  const since = now.getTime() - DSO_WINDOW_DAYS * DAY_MS;
  const billed = invoices.filter(
    (invoice) =>
      !NOT_BILLED.includes(invoice.status) &&
      invoice.issuedAt.getTime() >= since,
  );
  const receivable = sum(
    invoices.filter((invoice) => ["sent", "overdue"].includes(invoice.status)),
    (invoice) => invoice.amountDue,
  );
  const sales = sum(billed, (invoice) => invoice.total);
  const dso =
    sales > 0 ? Math.round((receivable / sales) * DSO_WINDOW_DAYS) : 0;
  const delays = invoices.flatMap((invoice) =>
    invoice.status === "paid" &&
    invoice.paidAt &&
    invoice.paidAt.getTime() >= since
      ? [daysBetween(invoice.issuedAt, invoice.paidAt)]
      : [],
  );
  const average =
    delays.length > 0
      ? Math.round(
          delays.reduce((total, days) => total + days, 0) / delays.length,
        )
      : 0;
  return {
    id: "dso",
    icon: "i-ph-calendar-check",
    tone: "primary",
    eyebrow: "$helio.finance.kpis.dso.label",
    value: {
      key: "$helio.finance.kpis.dso.value",
      params: { count: { type: "count", value: dso } },
    },
    detail: {
      key: "$helio.finance.kpis.dso.detail",
      params: { days: { type: "number", value: average } },
    },
  };
}

/** The four cells of the invoice KPI strip. */
export async function invoiceKpis(links: KpiLinks): Promise<StatGroupItem[]> {
  const invoices = await GetModel(InvoiceModel).getAll();
  return [
    outstandingCell(invoices, links.sent),
    overdueCell(invoices, links.overdue),
    collectedCell(invoices, links.paid),
    dsoCell(invoices),
  ];
}
