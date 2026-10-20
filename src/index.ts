import path from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { assertClientBaseUrlSet } from "./client-origin";
import {
  registerHelioAutomationNodes,
  startHelioMessaging,
} from "./helio/platform/automation";
import { startHelioMarketing } from "./helio/platform/marketing";
import { startHelioMedia } from "./helio/platform/media";
import { registerSaasShowcase } from "./helio/platform/saas";
import { startServiceSimulator, stopServiceSimulator } from "./helio/service";
import { DEMO_SCHEMA_NAME } from "./schema";
import "./home";
import "./helio";

interface TemplateConfig {
  requireJwtSecret?: boolean;
  requireHtmlRenderSecret?: boolean;
  requireClientBaseUrl?: boolean;
}

export async function construct(config?: TemplateConfig): Promise<void> {
  // Checked at start, not in antelope.config.ts: the production build
  // evaluates the configuration without the deployment's secrets.
  if (config?.requireJwtSecret && !process.env.JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is required in production: it signs the dashboard's tokens, and the development secret is public.",
    );
  }
  if (config?.requireHtmlRenderSecret && !process.env.DMS_HTML_RENDER_SECRET) {
    throw new Error(
      "DMS_HTML_RENDER_SECRET is required in production: it signs the backend's calls to the frontend's HTML renderer, and the development secret is public.",
    );
  }
  if (config?.requireClientBaseUrl) assertClientBaseUrlSet();

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
  // The service desk simulator writes tickets: only once the schema exists.
  startServiceSimulator();

  // Helio's e-mail templates, send history and procedures (they read the
  // Helio collections, so after the schema). In the background, never failing.
  void startHelioMessaging();
  // Helio's media library and public website analytics, shipped as code.
  // Both run in the background: media waits for the storage endpoint.
  startHelioMedia();
  startHelioMarketing();
}

// The service desk simulator runs on a timer started in start(); stop it with
// the module so no ticket is created afterwards.
export function destroy(): void {
  stopServiceSimulator();
}

export function stop(): void {
  stopServiceSimulator();
}
