import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/dms/interfaces/dms/page";
import {
  Tab,
  TabVariant,
} from "@antelopejs-private/dms/interfaces/dms-base/tab";
import { Placeholder } from "@antelopejs-private/dms/interfaces/dms-base/placeholder";
import { Color, Size } from "@antelopejs-private/dms/interfaces/dms-base/types";
import { componentsCategory } from "./category";

@RegisterPage()
export class PageComponentTab extends PageController("tab", {
  displayName: "$demo.nav.tab",
  icon: "i-ph-squares-four",
  category: componentsCategory,
  order: 5,
  description: "$demo.pages.tab.description",
}) {
  static tabs = Tab({
    items: [
      {
        label: "$demo.tab.items.overview",
        icon: "i-ph-house",
        slot: "overview",
        shortcut: "o",
      },
      {
        label: "$demo.tab.items.activity",
        icon: "i-ph-pulse",
        slot: "activity",
        badge: { label: 12, color: "primary", variant: "soft" },
        shortcut: "a",
      },
      {
        label: "$demo.tab.items.settings",
        icon: "i-ph-gear",
        slot: "settings",
        shortcut: "s",
      },
      {
        label: "$demo.tab.items.billing",
        icon: "i-ph-credit-card",
        slot: "billing",
        disabled: true,
      },
    ],
    color: Color.primary,
    size: Size.medium,
    variant: TabVariant.pill,
    persistState: true,
    stateKey: "components-tab-demo",
  })
    .child(
      "overviewContent",
      Placeholder({ label: "Overview content", height: "220px" }),
      { slot: "overview" },
    )
    .child(
      "activityContent",
      Placeholder({ label: "Activity feed", height: "220px" }),
      { slot: "activity" },
    )
    .child(
      "settingsContent",
      Placeholder({ label: "Settings panel", height: "220px" }),
      { slot: "settings" },
    );
}
