// Seed of helio_invoices: a year of billing. Each project bills a 30%
// deposit when its quote is signed and the balance once installed; yearly
// maintenance and monitoring contracts and service calls fill the rest. Most
// are paid, a few overdue, the oldest paid ones archived.

import { buildSites, type SiteSeed } from "../monitoring/fixtures";
import { customerFacts, isBusiness } from "../projects/crm-facts";
import { type ProjectPlan, projectPlans } from "../projects/plan";
import { quoteTotals, VAT_BUSINESS, VAT_RESIDENTIAL } from "../sales/lines";
import type { QuoteLine } from "../sales/database";
import { COUNTS, invoiceId, PRODUCT_ROSTER } from "../shared/roster";
import { cents, createRng, DAY_MS, type Rng } from "../shared/seed";
import type { Invoice, InvoiceStatus, PaymentMethod } from "./database";

export type InvoiceSeed = Pick<
  Invoice,
  | "_id"
  | "number"
  | "customer"
  | "project"
  | "quote"
  | "status"
  | "issuedAt"
  | "dueAt"
  | "paidAt"
  | "amountExcl"
  | "vatRate"
  | "vatAmount"
  | "total"
  | "amountDue"
  | "paymentMethod"
  | "isArchived"
>;

const YEAR_DAYS = 365;
const DEPOSIT_SHARE = 0.3;
/** Paid invoices older than this are archived. */
const ARCHIVE_AFTER_DAYS = 300;

interface InvoiceDraft {
  customer: string;
  business: boolean;
  project?: string;
  quote?: string;
  amountExcl: number;
  vatRate: number;
  issuedAt: Date;
  /** A balance waiting for the electrical inspection stays a draft. */
  draft?: boolean;
}

function daysAgo(date: Date): number {
  return (Date.now() - date.getTime()) / DAY_MS;
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function projectDrafts(plan: ProjectPlan): InvoiceDraft[] {
  const business = isBusiness(plan.customer);
  const { subtotal } = quoteTotals(plan.lines, plan.vatRate);
  const base = {
    customer: plan.customer._id,
    business,
    project: plan.projectId,
    quote: plan.quoteId,
    vatRate: plan.vatRate,
  };
  const drafts: InvoiceDraft[] = [];
  const depositAt = plusDays(plan.signedAt, 2);
  if (daysAgo(depositAt) > 0 && daysAgo(depositAt) < YEAR_DAYS) {
    drafts.push({
      ...base,
      amountExcl: cents(subtotal * DEPOSIT_SHARE),
      issuedAt: depositAt,
    });
  }
  if (plan.status === "done" || plan.status === "inspection") {
    const balanceAt = new Date(
      Math.min(plusDays(plan.end, 3).getTime(), Date.now() - DAY_MS),
    );
    drafts.push({
      ...base,
      amountExcl: cents(subtotal - cents(subtotal * DEPOSIT_SHARE)),
      issuedAt: balanceAt,
      draft: plan.status === "inspection",
    });
  }
  return drafts;
}

function price(id: string): number {
  return PRODUCT_ROSTER.find((entry) => entry.id === id)?.price ?? 0;
}

// A contract renewal, a service call or a cleaning on a monitored site,
// issued after the site was commissioned.
function serviceDraft(rng: Rng, site: SiteSeed): InvoiceDraft {
  const business = isBusiness(customerFacts(site.customer));
  const kind = rng.weighted([
    ["maintenance", 3],
    ["monitoring", 3],
    ["call", 3],
    ["cleaning", 1],
  ] as const);
  const lines: QuoteLine[] = {
    maintenance: [
      { product: "prod-22", label: "", qty: 1, unitPrice: price("prod-22") },
    ],
    monitoring: [
      { product: "prod-23", label: "", qty: 1, unitPrice: price("prod-23") },
    ],
    call: [
      {
        product: "prod-21",
        label: "",
        qty: rng.int(1, 4),
        unitPrice: price("prod-21"),
      },
    ],
    cleaning: [
      {
        product: "prod-24",
        label: "",
        qty: Math.round(site.capacityKwp * 2.4),
        unitPrice: price("prod-24"),
      },
    ],
  }[kind];
  // A monitoring subscription is a service, never renovation work: 21%.
  const vatRate =
    business || kind === "monitoring" ? VAT_BUSINESS : VAT_RESIDENTIAL;
  const since = Math.min(
    YEAR_DAYS - 1,
    Math.floor(daysAgo(site.commissionedAt)) - 1,
  );
  return {
    customer: site.customer,
    business,
    amountExcl: quoteTotals(lines, vatRate).subtotal,
    vatRate,
    issuedAt: plusDays(new Date(), -rng.int(1, Math.max(2, since))),
  };
}

function paymentMethod(rng: Rng, business: boolean): PaymentMethod {
  return business
    ? rng.weighted<PaymentMethod>([
        ["transfer", 8],
        ["direct_debit", 2],
      ])
    : rng.weighted<PaymentMethod>([
        ["transfer", 6],
        ["direct_debit", 2],
        ["card", 2],
      ]);
}

// Paid, waiting or overdue, from the due date: a quarter of the invoices
// that fell due in the last two months are still unpaid.
function settle(
  rng: Rng,
  draft: InvoiceDraft,
  dueAt: Date,
): { status: InvoiceStatus; paidAt?: Date } {
  if (draft.draft) return { status: "draft" };
  const now = Date.now();
  if (dueAt.getTime() > now) {
    if (!rng.chance(0.35)) return { status: "sent" };
    return {
      status: "paid",
      paidAt: new Date(
        Math.min(
          draft.issuedAt.getTime() + rng.int(1, 10) * DAY_MS,
          now - DAY_MS / 4,
        ),
      ),
    };
  }
  if (daysAgo(dueAt) < 60 && rng.chance(0.25)) return { status: "overdue" };
  const paidAt =
    draft.issuedAt.getTime() +
    rng.int(
      3,
      Math.round((dueAt.getTime() - draft.issuedAt.getTime()) / DAY_MS) + 5,
    ) *
      DAY_MS;
  return {
    status: "paid",
    paidAt: new Date(Math.min(paidAt, now - DAY_MS / 4)),
  };
}

function toSeed(rng: Rng, draft: InvoiceDraft, index: number): InvoiceSeed {
  const dueAt = plusDays(draft.issuedAt, draft.business ? 30 : 15);
  const { status, paidAt } = settle(rng, draft, dueAt);
  const vatAmount = cents(draft.amountExcl * draft.vatRate);
  const total = cents(draft.amountExcl + vatAmount);
  return {
    _id: invoiceId(index),
    number: "",
    customer: draft.customer,
    project: draft.project,
    quote: draft.quote,
    status,
    issuedAt: draft.issuedAt,
    dueAt,
    paidAt,
    amountExcl: draft.amountExcl,
    vatRate: draft.vatRate,
    vatAmount,
    total,
    amountDue: status === "paid" ? 0 : total,
    paymentMethod: paymentMethod(rng, draft.business),
    isArchived:
      status === "paid" && daysAgo(draft.issuedAt) > ARCHIVE_AFTER_DAYS,
  };
}

// Three old service invoices were cancelled (a credit note replaced them);
// numbers follow the issue date within each year: F-2026-0001, …
function finish(seeds: InvoiceSeed[]): void {
  seeds
    .filter(
      (seed) =>
        !seed.project && seed.status === "paid" && daysAgo(seed.issuedAt) > 60,
    )
    .slice(0, 3)
    .forEach((seed) => {
      seed.status = "cancelled";
      seed.paidAt = undefined;
      seed.amountDue = 0;
    });
  const counters = new Map<number, number>();
  for (const seed of [...seeds].sort(
    (a, b) => a.issuedAt.getTime() - b.issuedAt.getTime(),
  )) {
    const year = seed.issuedAt.getFullYear();
    const next = (counters.get(year) ?? 0) + 1;
    counters.set(year, next);
    seed.number = `F-${year}-${String(next).padStart(4, "0")}`;
  }
}

let invoices: InvoiceSeed[] | undefined;

/** The 200 invoices, `inv-001` … `inv-200`. */
export function buildInvoices(): InvoiceSeed[] {
  if (!invoices) {
    const rng = createRng(0x9e110007);
    const sites = buildSites();
    const drafts = projectPlans()
      .flatMap(projectDrafts)
      .slice(0, COUNTS.invoices);
    while (drafts.length < COUNTS.invoices)
      drafts.push(serviceDraft(rng, rng.pick(sites)));
    invoices = drafts.map((draft, at) => toSeed(rng, draft, at + 1));
    finish(invoices);
  }
  return invoices;
}
