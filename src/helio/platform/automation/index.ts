// Helio in the automation module: its own triggers and actions in the
// procedure builder, and five procedures shipped as code. The node types are
// registered from construct() (queued until the module attaches, removed with
// this module on unload); the procedures are declared from start(), after the
// Helio e-mail templates their first runs send.

import { Logging } from "@antelopejs/interface-core/logging";
import {
  DeclareProcedure,
  InvokeProcedure,
  RegisterActionType,
  RegisterTriggerType,
} from "@antelopejs/interface-dms-automation";
import { startHelioMailing } from "../mailing";
import { businessActionTypes } from "./actions-business";
import { serviceActionTypes } from "./actions-service";
import { FIRST_RUN_PROCEDURES, HELIO_PROCEDURES } from "./procedures";
import { helioTriggerTypes } from "./triggers";

export { fireQuoteAccepted, fireTicketOpened } from "./events";

/** Adds the Helio triggers and actions to the procedure builder. */
export function registerHelioAutomationNodes(): void {
  for (const trigger of helioTriggerTypes) RegisterTriggerType(trigger);
  for (const action of [...serviceActionTypes, ...businessActionTypes]) {
    RegisterActionType(action);
  }
}

// A procedure created just now runs once, so its run history is not empty
// and the reminders and confirmations due today go out.
async function firstRun(id: string): Promise<void> {
  try {
    const runId = await InvokeProcedure(id, {});
    Logging.Info(`[helio] first run of ${id}: ${runId}`);
  } catch (error) {
    Logging.Warn(`[helio] first run of ${id} failed: ${String(error)}`);
  }
}

async function declareProcedures(): Promise<void> {
  const outcomes: string[] = [];
  for (const declaration of HELIO_PROCEDURES) {
    const declared = await DeclareProcedure(declaration);
    outcomes.push(`${declared.id}=${declared.status}`);
    for (const issue of declared.issues) {
      Logging.Warn(
        `[helio] ${declared.id}: ${issue.severity} ${issue.message}`,
      );
    }
    if (
      declared.status === "created" &&
      FIRST_RUN_PROCEDURES.has(declared.id)
    ) {
      await firstRun(declared.id);
    }
  }
  Logging.Info(`[helio] procedures: ${outcomes.join(", ")}`);
}

/**
 * The mail templates and history first (the procedures send those e-mails),
 * then the procedures. Never throws: Helio works without either module.
 */
export async function startHelioMessaging(): Promise<void> {
  try {
    await startHelioMailing();
  } catch (error) {
    Logging.Warn(`[helio] mailing setup failed: ${String(error)}`);
  }
  try {
    await declareProcedures();
  } catch (error) {
    Logging.Warn(`[helio] automation setup failed: ${String(error)}`);
  }
}
