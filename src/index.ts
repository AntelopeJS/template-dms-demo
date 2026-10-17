import path from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { stopServiceSimulator } from "./helio/service";
import { DEMO_SCHEMA_NAME } from "./schema";
import "./home";
import "./components";
import "./helio";

export async function construct(): Promise<void> {}

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

// The service desk simulator runs on a timer started when its module is
// imported; stop it with the module so no ticket is created afterwards.
export function destroy(): void {
  stopServiceSimulator();
}

export function stop(): void {
  stopServiceSimulator();
}
