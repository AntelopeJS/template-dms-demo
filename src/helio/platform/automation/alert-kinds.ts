import type { TicketCategory, TicketPriority } from "../../service/database";

/** What a monitoring alert opens a ticket as. */
export interface AlertKind {
  category: TicketCategory;
  subject: string;
}

const ALERT_KINDS = new Map<string, AlertKind>([
  [
    "inverter_offline",
    { category: "inverter_error", subject: "onduleur hors ligne" },
  ],
  [
    "string_fault",
    {
      category: "inverter_error",
      subject: "défaut sur une chaîne de panneaux",
    },
  ],
  [
    "low_production",
    { category: "no_production", subject: "production anormalement basse" },
  ],
  [
    "communication_lost",
    { category: "monitoring", subject: "perte de communication" },
  ],
]);
const DEFAULT_ALERT: AlertKind = {
  category: "monitoring",
  subject: "anomalie détectée",
};

const PRIORITY_BY_SEVERITY = new Map<string, TicketPriority>([
  ["critical", "urgent"],
  ["warning", "high"],
  ["info", "normal"],
]);

/** The kind of ticket an alert named `alert` opens; a generic one when unknown. */
export function alertKindOf(alert: string | undefined): AlertKind {
  return ALERT_KINDS.get(alert ?? "") ?? DEFAULT_ALERT;
}

/** The priority of a ticket opened for an alert of `severity`; normal when unknown. */
export function priorityOf(severity: string | undefined): TicketPriority {
  return PRIORITY_BY_SEVERITY.get(severity ?? "") ?? "normal";
}
