import path from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { DEMO_SCHEMA_NAME } from "./schema";
import "./home";
import "./components";
import "./demo-app";

interface TemplateConfig {
  requireJwtSecret?: boolean;
  requireHtmlRenderSecret?: boolean;
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
}

export async function start(): Promise<void> {
  // Provision this template's own schema (tables tagged with DEMO_SCHEMA_NAME)
  // and run their fixtures. Runs after the DMS start(), so the database
  // adapter is already available.
  await RegisterSchema(DEMO_SCHEMA_NAME);

  void AddFrontendModule({
    name: "template-dms-demo-frontend-vue",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    priority: 100,
  });
}

export function destroy(): void {}

export function stop(): void {}
