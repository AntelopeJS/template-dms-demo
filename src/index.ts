import path from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { AddFrontendModule } from "@antelopejs-private/dms/interfaces/dms/page";
import { DEMO_SCHEMA_NAME } from "./schema";
import "./home";
import "./components";
import "./demo-app";

export async function construct(): Promise<void> {}

export async function start(): Promise<void> {
  // Provision this template's own schema (tables tagged with DEMO_SCHEMA_NAME)
  // and run their fixtures. Runs after the DMS start(), so the database
  // adapter is already available.
  await RegisterSchema(DEMO_SCHEMA_NAME);

  void AddFrontendModule({
    name: "template-dms-demo-nuxt-layer",
    sourcePath: path.join(__dirname, "../nuxt-layer"),
    renderer: { name: "vue", version: "3" },
    priority: 100,
    options: { dmsI18nAppLayer: true },
  });
}

export function destroy(): void {}

export function stop(): void {}
