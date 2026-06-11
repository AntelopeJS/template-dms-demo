import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import { Placeholder } from "@antelopejs-private/cms/interfaces/cms-base/placeholder";
import { componentsCategory } from "./category";

@RegisterPage()
export class PageComponentPlaceholder extends PageController("placeholder", {
  displayName: "$demo.nav.placeholder",
  icon: "i-ph-placeholder",
  category: componentsCategory,
  order: 8,
  description: "$demo.pages.placeholder.description",
}) {
  static block = Placeholder({
    label: "Future content goes here",
    height: "240px",
    width: "100%",
  });
}
