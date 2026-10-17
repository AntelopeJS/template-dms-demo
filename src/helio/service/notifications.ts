// An urgent ticket cannot wait for someone to look at the desk: the owners of
// the instance get a notification linking straight to it (the desk filters
// on `?ticket=<number>`).

import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  Notification,
  NotificationCategory,
  NotificationSubject,
} from "@antelopejs/interface-dms/notifications";
import { CustomerModel } from "../crm/database";
import type { Ticket } from "./database";
import { SERVICE_DESK_PATH } from "./options";

// Declared at import time, the category before its subject, so the subject
// is registered before the first urgent ticket arrives.
const serviceCategory = NotificationCategory("helio-service", {
  labelKey: "helio.service.notifications.category",
  descriptionKey: "helio.service.notifications.categoryDescription",
  icon: "i-ph-lifebuoy",
});

const urgentTicketSubject = NotificationSubject("urgent-tickets", {
  category: serviceCategory,
  labelKey: "helio.service.notifications.urgentSubject",
  descriptionKey: "helio.service.notifications.urgentSubjectDescription",
  togglePermission: "allowed",
});

/**
 * Tells the owners an urgent ticket arrived. Best effort: a failure is logged
 * and never fails the write that created the ticket.
 */
export async function notifyUrgentTicket(
  ticket: Pick<Ticket, "number" | "subject" | "customer">,
): Promise<void> {
  try {
    const [owners, customer] = await Promise.all([
      GetModel(UserModel).getOwners(),
      GetModel(CustomerModel).get(ticket.customer),
    ]);
    if (owners.length === 0) return;
    await Notification()
      .icon("i-ph-fire")
      .tone("error")
      .title("$helio.service.notifications.urgent.title")
      .description("$helio.service.notifications.urgent.description")
      .params({
        number: ticket.number,
        subject: ticket.subject,
        customer: customer?.name ?? "",
      })
      .subject(urgentTicketSubject)
      .linkTo(
        `${SERVICE_DESK_PATH}?ticket=${encodeURIComponent(ticket.number)}`,
      )
      .build()
      .toUsers(
        owners.map((owner) => owner._id),
        { readScope: "shared" },
      );
  } catch (error) {
    Logging.Error(
      `[helio] urgent ticket notification failed: ${String(error)}`,
    );
  }
}
