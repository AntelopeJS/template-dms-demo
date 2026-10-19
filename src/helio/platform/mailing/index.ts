import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
// Helio's transactional e-mails, shipped as code to the Mailing module: one
// "Helio" category, seven templates in French and English, and the history of
// the last weeks. Every declaration is idempotent and keeps what a user edited
// in the dashboard since (the module answers "kept" and leaves it alone).

import { Logging } from "@antelopejs/interface-core/logging";
import {
  DeclareTemplate,
  DeclareTemplateCategory,
} from "@antelopejs/interface-dms-mailing";
import { HELIO_MAIL_CATEGORY } from "./format";
import { importMailHistory } from "./history";
import { noticedRecords, recordNotice } from "./notices";
import { BILLING_TEMPLATES } from "./templates-billing";
import { SALES_TEMPLATES } from "./templates-sales";
import { SERVICE_TEMPLATES } from "./templates-service";

export {
  mailInstallation,
  mailInvoiceReminder,
  mailQuoteAccepted,
  mailQuoteSent,
  mailTicketReceived,
  mailTicketsResolved,
  MAIL_SOURCES,
} from "./send";
export { noticedRecords, recordNotice } from "./notices";

const TEMPLATES = [
  ...SALES_TEMPLATES,
  ...BILLING_TEMPLATES,
  ...SERVICE_TEMPLATES,
];

async function declareTemplates(): Promise<void> {
  await DeclareTemplateCategory({
    tenantId: DEFAULT_TENANT_ID,
    id: HELIO_MAIL_CATEGORY,
    label: "Helio",
    icon: "i-ph-sun",
  });
  const outcomes: string[] = [];
  for (const template of TEMPLATES) {
    const { outcome } = await DeclareTemplate({
      ...template,
      author: "Helio",
    });
    outcomes.push(`${template.slug}=${outcome}`);
  }
  Logging.Info(`[helio] mail templates: ${outcomes.join(", ")}`);
}

// Imported once per database: afterwards the live actions write the log. A
// second import would pick up what happened since (a quote accepted a minute
// ago) and duplicate the e-mail the action itself sent.
const HISTORY_VERSION = "v1";

async function importHistory(): Promise<void> {
  if ((await noticedRecords("history")).has(HISTORY_VERSION)) return;
  const history = await importMailHistory();
  // The weekly confirmation run must not write again to these customers.
  for (const { projectId, sentAt } of history.confirmedProjects) {
    await recordNotice("installation", projectId, sentAt);
  }
  await recordNotice("history", HISTORY_VERSION, new Date());
  Logging.Info(
    `[helio] mail history: ${history.imported} imported, ${history.skipped} already there, ${history.reported} bounce/complaint event(s) reported`,
  );
}

/**
 * Declares the templates, then imports the history (which names them). Run
 * from start(), after the demo schema is provisioned: the history reads the
 * Helio collections.
 */
export async function startHelioMailing(): Promise<void> {
  await declareTemplates();
  await importHistory();
}
