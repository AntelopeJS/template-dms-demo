import path from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { AddNuxtLayer } from "@antelopejs-private/cms/interfaces/cms/page";
import { DEMO_SCHEMA_NAME } from "./schema";
import "./home";
import "./components";
import "./demo-app";

export async function construct(): Promise<void> {}

export async function start(): Promise<void> {
  // Provision this template's own schema (tables tagged with DEMO_SCHEMA_NAME)
  // and run their fixtures. Runs after the CMS start(), so the database
  // adapter is already available.
  await RegisterSchema(DEMO_SCHEMA_NAME);

  // Ship the local nuxt-layer (custom Vue components) to the CMS frontend.
  void AddNuxtLayer({
    name: "template-cms-demo-nuxt-layer",
    path: path.join(__dirname, "../nuxt-layer"),
    priority: 100,
  });
}

export function destroy(): void {}

export function stop(): void {}
