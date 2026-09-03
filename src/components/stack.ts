import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import {
  HStack,
  Placeholder,
  Spacer,
  VStack,
} from "@antelopejs-private/cms/interfaces/cms-base";
import { componentsCategory } from "./category";

@RegisterPage()
export class PageComponentStack extends PageController("stack", {
  displayName: "$demo.nav.stack",
  icon: "i-ph-stack",
  category: componentsCategory,
  order: 7,
  description: "$demo.pages.stack.description",
}) {
  static shell = VStack({ spacing: "16px", alignment: "stretch" })
    .child(
      "header",
      HStack({ spacing: "12px", alignment: "center" })
        .child(
          "logo",
          Placeholder({ label: "Logo", height: "56px", width: "56px" }),
        )
        .child(
          "title",
          Placeholder({ label: "App title", height: "56px", width: "220px" }),
        )
        .child("push", Spacer())
        .child(
          "profile",
          Placeholder({ label: "Profile", height: "56px", width: "56px" }),
        ),
    )
    .child(
      "body",
      HStack({ spacing: "16px", alignment: "stretch" })
        .child(
          "sidebar",
          VStack({ spacing: "8px", alignment: "stretch" })
            .child(
              "nav1",
              Placeholder({
                label: "Nav item",
                height: "44px",
                width: "180px",
              }),
            )
            .child(
              "nav2",
              Placeholder({
                label: "Nav item",
                height: "44px",
                width: "180px",
              }),
            )
            .child("grow", Spacer({ minSize: "24px", grow: 1 }))
            .child(
              "help",
              Placeholder({ label: "Help", height: "44px", width: "180px" }),
            ),
        )
        .child(
          "main",
          VStack({ spacing: "16px", alignment: "stretch" })
            .child(
              "cards",
              HStack({
                spacing: "16px",
                alignment: "stretch",
                distribution: "space-between",
                wrap: true,
              })
                .child(
                  "c1",
                  Placeholder({
                    label: "Card",
                    height: "110px",
                    width: "200px",
                  }),
                )
                .child(
                  "c2",
                  Placeholder({
                    label: "Card",
                    height: "110px",
                    width: "200px",
                  }),
                )
                .child(
                  "c3",
                  Placeholder({
                    label: "Card",
                    height: "110px",
                    width: "200px",
                  }),
                ),
            )
            .child(
              "chart",
              Placeholder({ label: "Main panel", height: "240px" }),
            ),
        ),
    );
}
