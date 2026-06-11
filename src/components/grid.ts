import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import {
  Grid,
  GridRow,
} from "@antelopejs-private/cms/interfaces/cms-base/grid";
import { Placeholder } from "@antelopejs-private/cms/interfaces/cms-base/placeholder";
import { componentsCategory } from "./category";

@RegisterPage()
export class PageComponentGrid extends PageController("grid", {
  displayName: "$demo.nav.grid",
  icon: "i-ph-grid-four",
  category: componentsCategory,
  order: 6,
  description: "$demo.pages.grid.description",
}) {
  static layout = Grid({ gap: "1rem" })
    .child(
      "header",
      GridRow().child(
        "hero",
        Placeholder({ label: "Full-width header (colSpan 2)", height: "120px" }),
        { colSpan: 2 },
      ),
    )
    .child(
      "content",
      GridRow()
        .child(
          "main",
          Placeholder({ label: "Main content", height: "260px" }),
        )
        .child(
          "side",
          Grid({ gap: "0.5rem" })
            .child(
              "sideRow1",
              GridRow().child(
                "widget1",
                Placeholder({ label: "Nested widget 1", height: "125px" }),
              ),
            )
            .child(
              "sideRow2",
              GridRow().child(
                "widget2",
                Placeholder({ label: "Nested widget 2", height: "125px" }),
              ),
            ),
        ),
    );
}
