// The procedures Helio ships, as the builder would export them. Each one is
// declared on every boot; the automation module creates it once, refreshes it
// while nobody touched it, and keeps whatever a user changed since.

import type { ProcedureDeclaration } from "@antelopejs/interface-dms-automation";
import { graph, next, node, wire } from "./graph";
import { HELIO_TRIGGERS } from "./triggers";

/** The webhook a monitoring platform posts its alerts to (on the API server). */
export const MONITORING_WEBHOOK_PATH = "/hooks/helio/monitoring-alert";

const NOTIFY = "dms.send-notification";
const MANAGERS = "helio.find-managers";

const urgentTicketDispatch: ProcedureDeclaration = {
  id: "helio.urgent-ticket-dispatch",
  name: "Urgent ticket → dispatch the on-call technician",
  description:
    "When an urgent ticket arrives, the technician with the fewest open tickets takes it and the managers are notified.",
  enabled: true,
  graph: graph(
    [
      node("urgent", "trigger", HELIO_TRIGGERS.ticketOpened, [0, 0], {
        priority: "urgent",
      }),
      node("assign", "action", "helio.assign-on-call", [1, 0]),
      node("managers", "action", MANAGERS, [2, 0]),
      node("notify", "action", NOTIFY, [3, 0], {
        title: "$helio.platform.automation.notifications.dispatched",
        icon: "i-ph-siren",
      }),
    ],
    [
      next("urgent", "assign"),
      next("assign", "managers"),
      next("managers", "notify"),
    ],
    [
      wire("urgent", "ticketId", "assign", "ticketId"),
      wire("managers", "userIds", "notify", "userIds"),
      wire("assign", "summary", "notify", "description"),
      wire("assign", "link", "notify", "linkTo"),
    ],
  ),
};

const overdueInvoiceReminders: ProcedureDeclaration = {
  id: "helio.overdue-invoice-reminders",
  name: "Weekdays 8:00 → remind invoices overdue for 14 days",
  description:
    "Every weekday morning, e-mails a payment reminder for each invoice overdue for more than 14 days (at most one a week per invoice), then tells the managers.",
  enabled: true,
  graph: graph(
    [
      node("weekday", "trigger", "schedule.cron", [0, 0], {
        cron: "0 8 * * 1-5",
      }),
      node("manual", "trigger", "manual", [0, 1]),
      node("remind", "action", "helio.remind-overdue-invoices", [1, 0], {
        minDaysOverdue: 14,
        minDaysBetween: 7,
      }),
      node("none", "data", "const.number", [1, 1], { value: 0 }),
      node("any", "data", "compare.gt", [2, 1]),
      node("if", "if", undefined, [2, 0]),
      node("managers", "action", MANAGERS, [3, 0]),
      node("notify", "action", NOTIFY, [4, 0], {
        title: "$helio.platform.automation.notifications.reminders",
        icon: "i-ph-envelope-simple-open",
        linkTo: "/helio/invoices?table.tab=overdue",
      }),
    ],
    [
      next("weekday", "remind"),
      next("manual", "remind"),
      next("remind", "if"),
      next("if", "managers", "then"),
      next("managers", "notify"),
    ],
    [
      wire("remind", "reminded", "any", "a"),
      wire("none", "value", "any", "b"),
      wire("any", "result", "if", "cond"),
      wire("managers", "userIds", "notify", "userIds"),
      wire("remind", "summary", "notify", "description"),
    ],
  ),
};

const monitoringAlertTicket: ProcedureDeclaration = {
  id: "helio.monitoring-alert-ticket",
  name: "Monitoring alert webhook → open a service ticket",
  description: `The monitoring platform posts { siteId, alert, severity, message } to ${MONITORING_WEBHOOK_PATH}: a ticket is opened on the site (one per open problem), urgent when the alert is critical.`,
  enabled: true,
  graph: graph(
    [
      node("alert", "trigger", "webhook", [0, 0], {
        path: MONITORING_WEBHOOK_PATH,
        method: "POST",
      }),
      node("ticket", "action", "helio.create-ticket", [1, 0]),
      node("log", "action", "log.message", [2, 0], { level: "info" }),
    ],
    [next("alert", "ticket"), next("ticket", "log")],
    [
      wire("alert", "body", "ticket", "payload"),
      wire("ticket", "summary", "log", "message"),
    ],
  ),
};

const quoteAcceptedKickoff: ProcedureDeclaration = {
  id: "helio.quote-accepted-kickoff",
  name: "Quote accepted → plan the kick-off",
  description:
    "When a customer signs a quote, a kick-off call is added to its project (or to the deal's next step) and the managers are notified.",
  enabled: true,
  graph: graph(
    [
      node("accepted", "trigger", HELIO_TRIGGERS.quoteAccepted, [0, 0]),
      node("kickoff", "action", "helio.plan-kickoff", [1, 0]),
      node("managers", "action", MANAGERS, [2, 0]),
      node("notify", "action", NOTIFY, [3, 0], {
        title: "$helio.platform.automation.notifications.kickoff",
        icon: "i-ph-flag-banner",
      }),
    ],
    [
      next("accepted", "kickoff"),
      next("kickoff", "managers"),
      next("managers", "notify"),
    ],
    [
      wire("accepted", "quoteId", "kickoff", "quoteId"),
      wire("managers", "userIds", "notify", "userIds"),
      wire("kickoff", "summary", "notify", "description"),
      wire("kickoff", "link", "notify", "linkTo"),
    ],
  ),
};

const installationConfirmations: ProcedureDeclaration = {
  id: "helio.installation-confirmations",
  name: "Fridays 14:00 → confirm the coming installations",
  description:
    "Every Friday afternoon, e-mails the customers whose installation starts within 14 days the date, the address and their team lead (once per project).",
  enabled: true,
  graph: graph(
    [
      node("friday", "trigger", "schedule.cron", [0, 0], {
        cron: "0 14 * * 5",
      }),
      node("manual", "trigger", "manual", [0, 1]),
      node("confirm", "action", "helio.confirm-installations", [1, 0], {
        daysAhead: 14,
      }),
      node("log", "action", "log.message", [2, 0], { level: "info" }),
    ],
    [
      next("friday", "confirm"),
      next("manual", "confirm"),
      next("confirm", "log"),
    ],
    [wire("confirm", "summary", "log", "message")],
  ),
};

export const HELIO_PROCEDURES = [
  urgentTicketDispatch,
  overdueInvoiceReminders,
  monitoringAlertTicket,
  quoteAcceptedKickoff,
  installationConfirmations,
];

/** Procedures with a manual trigger, run once when first created. */
export const FIRST_RUN_PROCEDURES = new Set([
  overdueInvoiceReminders.id,
  installationConfirmations.id,
]);
