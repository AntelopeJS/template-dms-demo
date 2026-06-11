import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import { CustomComponent } from "@antelopejs-private/cms/interfaces/cms-base/custom";
import { DefaultLayout } from "@antelopejs-private/cms/interfaces/cms-base/layouts";

// The home page renders the DemoReadme component shipped by the local
// nuxt-layer (nuxt-layer/app/components/Readme.vue): a pretty, translated
// overview of what this template contains.
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
