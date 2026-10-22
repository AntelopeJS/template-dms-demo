import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { frontendModule } from "./frontend-module";
import { DEMO_SCHEMA_NAME } from "./schema";
import "./home";
import "./components";
import "./demo-app";

export function construct(): void {}

export async function start(): Promise<void> {
  // Provision this template's own schema (tables tagged with DEMO_SCHEMA_NAME)
  // and run their fixtures. Runs after the DMS start(), so the database
  // adapter is already available.
  await RegisterSchema(DEMO_SCHEMA_NAME);

  void AddFrontendModule(frontendModule());
}

export function destroy(): void {}

export function stop(): void {}
