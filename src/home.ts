import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";

// The home page renders the DemoReadme component shipped by the local
// frontend module (frontend-vue/app/components/Readme.vue): a pretty,
// translated overview of what this template contains.
@RegisterPage()
export class PageHome extends PageController(
  "home",
  {
    displayName: "$demo.nav.home",
    icon: "i-ph-house",
    category: pagesCategory,
    order: 0,
    description: "$demo.pages.home.description",
  },
  DefaultLayout({ hideHeader: true }),
) {
  static readme = CustomComponent("demo-readme");
}
