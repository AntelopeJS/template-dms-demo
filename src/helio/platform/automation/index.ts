// Helio in the automation module: its own triggers and actions in the
// procedure builder, and five procedures shipped as code. The node types are
// registered from construct() (queued until the module attaches, removed with
// this module on unload); the procedures are declared from start(), after the
// Helio e-mail templates their first runs send.

import { Logging } from "@antelopejs/interface-core/logging";
import {
  DeclareProcedure,
  InvokeProcedure,
  ListActionTypes,
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

const TYPE_WAIT_MS = 30_000;
const TYPE_POLL_MS = 500;

// The action types the shipped procedures use: Helio's own, and those other
// modules register (the DMS's "dms.send-notification").
function actionTypesUsed(): Set<string> {
  const ids = new Set<string>();
  for (const declaration of HELIO_PROCEDURES) {
    for (const node of declaration.graph.nodes) {
      if (node.kind === "action" && node.typeId) ids.add(node.typeId);
    }
  }
  return ids;
}

/**
 * Waits until every action type the procedures use is registered. Modules
 * register their node types as they start, in no set order: declared before
 * the DMS added "dms.send-notification", a procedure is stored with an
 * "unknown type" warning. Gives up after a while and declares anyway (the
 * automation module tolerates a type that comes late).
 */
async function waitForActionTypes(): Promise<void> {
  const wanted = actionTypesUsed();
  const deadline = Date.now() + TYPE_WAIT_MS;
  let missing: string[] = [...wanted];
  while (Date.now() < deadline) {
    const known = new Set((await ListActionTypes()).map((type) => type.id));
    missing = [...wanted].filter((id) => !known.has(id));
    if (missing.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, TYPE_POLL_MS));
  }
  Logging.Warn(
    `[helio] declaring procedures without action types: ${missing.join(", ")}`,
  );
}

async function declareProcedures(): Promise<void> {
  await waitForActionTypes();
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
