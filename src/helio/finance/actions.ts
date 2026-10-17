// What the invoice row actions do to the stored invoices: record a payment,
// send a reminder, and move the invoices past their due date to "overdue".

import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DAY_MS } from "../shared/seed";
import { type Invoice, InvoiceModel, type PaymentMethod } from "./database";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

/** Statuses an invoice can be paid from: issued, not settled. */
export const PAYABLE_STATUSES = ["sent", "overdue"] as const;
const PAYMENT_METHOD_VALUES: readonly string[] = [
  "transfer",
  "direct_debit",
  "card",
];

/** The values of the "Mark as paid" confirmation. */
export interface PaymentInput {
  paymentMethod?: string;
  paidAt?: string;
}

const isPayable = (invoice: Invoice): boolean =>
  PAYABLE_STATUSES.some((status) => status === invoice.status);

function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_VALUES.includes(value);
}

// A payment is dated today when the dialog leaves the date empty, and never
// in the future: money not received yet is not a payment.
function paymentDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + DAY_MS) {
    throw new HTTPResult(HTTP_BAD_REQUEST, {
      message: "$helio.finance.invoices.markPaid.futureDate",
      field: "paidAt",
    });
  }
  return date;
}

function paymentMethod(raw: string | undefined): PaymentMethod {
  if (raw && isPaymentMethod(raw)) return raw;
  throw new HTTPResult(HTTP_BAD_REQUEST, {
    message: "$helio.finance.invoices.markPaid.methodRequired",
    field: "paymentMethod",
  });
}

async function payableInvoices(ids: string[]): Promise<Invoice[]> {
  const model = GetModel(InvoiceModel);
  const invoices = await Promise.all(
    ids.filter(Boolean).map((id) => model.get(id)),
  );
  return invoices.filter(
    (invoice): invoice is Invoice => !!invoice && isPayable(invoice),
  );
}

/**
 * Records the payment of the invoices still to be paid among `ids`: paid on
 * that date with that method, nothing left due. Answers how many were paid;
 * refuses when none of them could be.
 */
export async function markInvoicesPaid(
  ids: string[],
  input: PaymentInput,
): Promise<number> {
  const method = paymentMethod(input.paymentMethod);
  const paidAt = paymentDate(input.paidAt);
  const invoices = await payableInvoices(ids);
  if (invoices.length === 0) {
    throw new HTTPResult(HTTP_CONFLICT, {
      message: "$helio.finance.invoices.markPaid.nothing",
    });
  }
  const model = GetModel(InvoiceModel);
  await Promise.all(
    invoices.map((invoice) =>
      model.update(invoice._id, {
        status: "paid",
        paidAt,
        amountDue: 0,
        paymentMethod: method,
      }),
    ),
  );
  return invoices.length;
}

/**
 * Stamps a reminder on the overdue invoices among `ids` (the e-mail itself
 * is out of the demo's scope). Answers how many were reminded.
 */
export async function remindInvoices(ids: string[]): Promise<number> {
  const model = GetModel(InvoiceModel);
  const invoices = (
    await Promise.all(ids.filter(Boolean).map((id) => model.get(id)))
  ).filter((invoice): invoice is Invoice => invoice?.status === "overdue");
  if (invoices.length === 0) {
    throw new HTTPResult(HTTP_CONFLICT, {
      message: "$helio.finance.invoices.remind.nothing",
    });
  }
  const remindedAt = new Date();
  await Promise.all(
    invoices.map((invoice) =>
      model.update(invoice._id, {
        remindedAt,
        reminderCount: (invoice.reminderCount ?? 0) + 1,
      }),
    ),
  );
  return invoices.length;
}

const OVERDUE_SWEEP_EVERY_MS = 5 * 60 * 1000;
let lastSweep = 0;

/**
 * Moves the sent invoices whose due date passed to "overdue". The seed is
 * written once, relative to its boot: without this, an invoice due tomorrow
 * would stay "sent" forever. Read paths call it, at most every few minutes.
 */
export async function sweepOverdueInvoices(): Promise<void> {
  if (Date.now() - lastSweep < OVERDUE_SWEEP_EVERY_MS) return;
  lastSweep = Date.now();
  const model = GetModel(InvoiceModel);
  const sent = await model.getBy("status", "sent");
  const late = sent.filter((invoice) => invoice.dueAt.getTime() < Date.now());
  await Promise.all(
    late.map((invoice) => model.update(invoice._id, { status: "overdue" })),
  );
}
