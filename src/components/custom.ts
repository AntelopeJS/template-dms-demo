import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/dms/interfaces/dms/page";
import { CustomComponent } from "@antelopejs-private/dms/interfaces/dms-base/custom";
import { componentsCategory } from "./category";

// "demo-callout" resolves to the DemoCallout component shipped by the local
// nuxt-layer (see nuxt-layer/app/components/Callout.vue and AddNuxtLayer in
// src/index.ts).
@RegisterPage()
export class PageComponentCustom extends PageController("custom", {
  displayName: "$demo.nav.custom",
  icon: "i-ph-sparkle",
  category: componentsCategory,
  order: 9,
  description: "$demo.pages.custom.description",
}) {
  static callout = CustomComponent("demo-callout").options({
    title: "$demo.custom.callout.title",
    message: "$demo.custom.callout.message",
    icon: "i-ph-sparkle",
    color: "primary",
  });
}
