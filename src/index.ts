import path from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { assertClientBaseUrlSet } from "./client-origin";
import {
  registerHelioAutomationNodes,
  startHelioAutomation,
} from "./helio/platform/automation";
import { registerHelioProvisioning } from "./helio/platform/provisioning";
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

  // Provision this template's own schema (tables tagged with DEMO_SCHEMA_NAME)
  // and run their fixtures once the DMS has registered its own: before the
  // DMS provisions its default tenant, whose Helio data reads these tables.
  RegisterHook(Hook.DATABASE_INITIALIZED, async () => {
    await RegisterSchema(DEMO_SCHEMA_NAME);
    // The service desk simulator writes tickets: only once the schema exists.
    startServiceSimulator();
    return undefined;
  });
  registerSaasShowcase();
  registerHelioProvisioning();
  // Helio's triggers and actions in the automation builder.
  registerHelioAutomationNodes();
}

export async function start(): Promise<void> {
  // Helio's procedures, in the background, never failing.
  startHelioAutomation();
}

// The service desk simulator runs on a timer started in start(); stop it with
// the module so no ticket is created afterwards.
export function destroy(): void {
  stopServiceSimulator();
}

export function stop(): void {
  stopServiceSimulator();
}
