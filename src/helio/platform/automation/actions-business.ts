// Helio actions about money and planning: remind the customers of invoices
// long overdue, prepare the kick-off of a signed quote, and confirm the
// installation dates of the coming days to their customers.

import type { ActionType } from "@antelopejs/interface-dms-automation";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { CustomerModel, DealModel } from "../../crm/database";
import { type Invoice, InvoiceModel } from "../../finance/database";
import { INVOICES_TOPIC } from "../../finance/table";
import { PROJECT_PAGE_URL } from "../../projects/links";
import {
  type Project,
  ProjectModel,
  ProjectTaskModel,
} from "../../projects/database";
import { QuoteModel } from "../../sales/database";
import { QUOTES_PAGE_URL } from "../../sales/links";
import { DAY_MS } from "../../shared/seed";
import {
  mailInstallation,
  mailInvoiceReminder,
  MAIL_SOURCES,
  noticedRecords,
  recordNotice,
} from "../mailing";

const SENT = new Set(["queued", "sent", "delivered"]);

const money = (amount: number) =>
  new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" }).format(
    amount,
  );

interface ReminderInput {
  minDaysOverdue?: number;
  minDaysBetween?: number;
}

// Overdue for long enough, and not reminded too recently.
function needsReminder(invoice: Invoice, input: ReminderInput): boolean {
  const now = Date.now();
  const overdueFor = (now - invoice.dueAt.getTime()) / DAY_MS;
  const sinceLast = invoice.remindedAt
    ? (now - invoice.remindedAt.getTime()) / DAY_MS
    : Number.POSITIVE_INFINITY;
  return (
    invoice.status === "overdue" &&
    overdueFor >= (input.minDaysOverdue ?? 14) &&
    sinceLast >= (input.minDaysBetween ?? 7)
  );
}

// Stamps the reminder on the invoice; answers its number.
async function stampReminder(invoice: Invoice): Promise<number> {
  const reminderCount = (invoice.reminderCount ?? 0) + 1;
  await GetModel(InvoiceModel).update(invoice._id, {
    remindedAt: new Date(),
    reminderCount,
  });
  return reminderCount;
}

const remindOverdueInvoices: ActionType<
  ReminderInput,
  Record<string, unknown>
> = {
  id: "helio.remind-overdue-invoices",
  name: "$helio.platform.automation.actions.remindOverdue.name",
  description: "$helio.platform.automation.actions.remindOverdue.description",
  icon: "i-ph-envelope-simple-open",
  inputSchema: {
    type: "object",
    properties: {
      minDaysOverdue: {
        type: "number",
        title:
          "$helio.platform.automation.actions.remindOverdue.minDaysOverdue",
        default: 14,
      },
      minDaysBetween: {
        type: "number",
        title:
          "$helio.platform.automation.actions.remindOverdue.minDaysBetween",
        default: 7,
      },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      reminded: { type: "number" },
      amountDue: { type: "number" },
      summary: { type: "string" },
    },
  },
  async execute(input, ctx) {
    const overdue = await GetModel(InvoiceModel).getBy("status", "overdue");
    const due = overdue.filter((invoice) => needsReminder(invoice, input));
    let sent = 0;
    for (const invoice of due) {
      const result = await mailInvoiceReminder(
        invoice,
        await stampReminder(invoice),
        MAIL_SOURCES.overdueReminders,
      );
      if (result && SENT.has(result.status)) sent += 1;
      else ctx.log("warn", `reminder for ${invoice.number} not delivered`);
    }
    if (due.length > 0) {
      await PublishMessage(INVOICES_TOPIC, "reminded", {
        payload: { count: due.length },
      });
    }
    const amountDue = due.reduce((sum, invoice) => sum + invoice.amountDue, 0);
    ctx.log("info", `${due.length} reminder(s), ${sent} e-mailed`);
    return {
      reminded: due.length,
      amountDue,
      summary: `${due.map(({ number }) => number).join(", ")} · ${money(amountDue)}`,
    };
  },
};

// The project born from the quote gets a kick-off task; without one yet, the
// deal's next step says it.
async function kickoffTask(project: Project, quoteNumber: string) {
  const tasks = GetModel(ProjectTaskModel);
  const existing = await tasks.getBy("project", project._id);
  const _id = `kickoff-${project._id}`;
  if (existing.some((task) => task._id === _id)) return;
  await tasks.insert({
    _id,
    project: project._id,
    title: `Appel de lancement avec le client (devis ${quoteNumber})`,
    status: "todo",
    assignee: project.leadTechnician,
    dueDate: new Date(Date.now() + 3 * DAY_MS),
    estimateHours: 1,
    position: Math.max(0, ...existing.map(({ position }) => position)) + 1000,
  });
}

const planKickoff: ActionType<{ quoteId?: string }, Record<string, unknown>> = {
  id: "helio.plan-kickoff",
  name: "$helio.platform.automation.actions.planKickoff.name",
  description: "$helio.platform.automation.actions.planKickoff.description",
  icon: "i-ph-flag-banner",
  inputSchema: {
    type: "object",
    properties: { quoteId: { type: "string" } },
    required: ["quoteId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      target: { type: "string", enum: ["project", "deal"] },
      summary: { type: "string" },
      link: { type: "string" },
    },
  },
  async execute(input, ctx) {
    const quote = input.quoteId
      ? await GetModel(QuoteModel).get(input.quoteId)
      : undefined;
    if (!quote) throw new Error(`unknown quote "${input.quoteId ?? ""}"`);
    const customer = await GetModel(CustomerModel).get(quote.customer);
    const [project] = await GetModel(ProjectModel).getBy("quote", quote._id);
    const who = `${quote.number} · ${customer?.name ?? ""}`;
    if (project) {
      await kickoffTask(project, quote.number);
      ctx.log("info", `kick-off task added to ${project.code}`);
      return {
        target: "project",
        summary: `${who} · ${project.code}`,
        link: `${PROJECT_PAGE_URL}/${project._id}`,
      };
    }
    if (quote.deal) {
      await GetModel(DealModel).update(quote.deal, {
        nextStep: `Planifier l'appel de lancement (devis ${quote.number} signé)`,
        lastActivityAt: new Date(),
      });
    }
    ctx.log("info", "no project yet: the deal carries the kick-off");
    return {
      target: "deal",
      summary: who,
      link: `${QUOTES_PAGE_URL}?record=${quote._id}`,
    };
  },
};

// Scheduled projects starting within `daysAhead` days that were not told yet.
async function projectsToConfirm(daysAhead: number): Promise<Project[]> {
  const [scheduled, noticed] = await Promise.all([
    GetModel(ProjectModel).getBy("status", "scheduled"),
    noticedRecords("installation"),
  ]);
  const now = Date.now();
  return scheduled.filter(
    (project) =>
      !noticed.has(project._id) &&
      project.plannedStart.getTime() > now &&
      project.plannedStart.getTime() <= now + daysAhead * DAY_MS,
  );
}

const confirmInstallations: ActionType<
  { daysAhead?: number },
  Record<string, unknown>
> = {
  id: "helio.confirm-installations",
  name: "$helio.platform.automation.actions.confirmInstallations.name",
  description:
    "$helio.platform.automation.actions.confirmInstallations.description",
  icon: "i-ph-calendar-check",
  inputSchema: {
    type: "object",
    properties: {
      daysAhead: {
        type: "number",
        title:
          "$helio.platform.automation.actions.confirmInstallations.daysAhead",
        default: 14,
      },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      confirmed: { type: "number" },
      summary: { type: "string" },
    },
  },
  async execute(input, ctx) {
    const projects = await projectsToConfirm(input.daysAhead ?? 14);
    const confirmed: string[] = [];
    for (const project of projects) {
      const result = await mailInstallation(project);
      if (result && SENT.has(result.status)) {
        await recordNotice("installation", project._id, new Date());
        confirmed.push(project.code);
      } else {
        ctx.log("warn", `confirmation for ${project.code} not sent`);
      }
    }
    ctx.log("info", `${confirmed.length} installation date(s) confirmed`);
    return {
      confirmed: confirmed.length,
      summary: confirmed.join(", ") || "—",
    };
  },
};

export const businessActionTypes = [
  remindOverdueInvoices,
  planKickoff,
  confirmInstallations,
];
