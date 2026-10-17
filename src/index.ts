import path from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import {
  registerHelioAutomationNodes,
  startHelioMessaging,
} from "./helio/platform/automation";
import { startHelioMarketing } from "./helio/platform/marketing";
import { startHelioMedia } from "./helio/platform/media";
import { registerSaasShowcase } from "./helio/platform/saas";
import { stopServiceSimulator } from "./helio/service";
import { DEMO_SCHEMA_NAME } from "./schema";
import "./home";
import "./components";
import "./helio";

export async function construct(): Promise<void> {
  // Declared in construct() so dms-lang, which lists the frontend modules once
  // in its own start(), finds it: `dmsI18nAppLayer` makes its language files
  // (helio-*, demo-*) the editable "Project files" of Translations.
  await AddFrontendModule({
    name: "template-dms-demo-frontend-vue",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    priority: 100,
    options: { dmsI18nAppLayer: true },
  });

  registerSaasShowcase();
  // Helio's triggers and actions in the automation builder.
  registerHelioAutomationNodes();
}

export async function start(): Promise<void> {
  // Provision this template's own schema (tables tagged with DEMO_SCHEMA_NAME)
  // and run their fixtures. Runs after the DMS start(), so the database
  // adapter is already available.
  await RegisterSchema(DEMO_SCHEMA_NAME);

  // Helio's e-mail templates, send history and procedures (they read the
  // Helio collections, so after the schema). In the background, never failing.
  void startHelioMessaging();
  // Helio's media library and public website analytics, shipped as code.
  // Both run in the background: media waits for the storage endpoint.
  startHelioMedia();
  startHelioMarketing();
}

// The service desk simulator runs on a timer started when its module is
// imported; stop it with the module so no ticket is created afterwards.
export function destroy(): void {
  stopServiceSimulator();
}

export function stop(): void {
  stopServiceSimulator();
}
