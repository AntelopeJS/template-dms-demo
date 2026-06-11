import path from "node:path";
import { AddNuxtLayer } from "@antelopejs-private/cms/interfaces/cms/page";
import "./home";
import "./components";
import "./demo-app";

export async function construct(): Promise<void> {}

export async function start(): Promise<void> {
  // Ship the local nuxt-layer (custom Vue components) to the CMS frontend.
  void AddNuxtLayer({
    name: "template-cms-demo-nuxt-layer",
    path: path.join(__dirname, "../nuxt-layer"),
    priority: 100,
  });
}

export function destroy(): void {}

export function stop(): void {}
