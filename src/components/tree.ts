import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { componentsCategory } from "./category";

@RegisterPage()
export class PageComponentTree extends PageController("tree", {
  displayName: "$demo.nav.tree",
  icon: "i-ph-tree-structure",
  category: componentsCategory,
  order: 4,
  description: "$demo.pages.tree.description",
}) {
  static projectTree = Tree({
    title: "$demo.tree.title",
    description: "$demo.tree.description",
    color: Color.primary,
    size: Size.medium,
    multiple: true,
    propagateSelect: true,
    selectionBehavior: TreeSelectionBehavior.toggle,
    defaultExpanded: ["src", "src/components"],
    expandedIcon: "i-ph-folder-open",
    collapsedIcon: "i-ph-folder",
    staticNodes: [
      {
        label: "src",
        value: "src",
        icon: "i-ph-folder",
        children: [
          {
            label: "components",
            value: "src/components",
            icon: "i-ph-folder",
            children: [
              {
                label: "Button.vue",
                value: "src/components/button",
                icon: "i-ph-file-vue",
              },
              {
                label: "Card.vue",
                value: "src/components/card",
                icon: "i-ph-file-vue",
              },
            ],
          },
          { label: "index.ts", value: "src/index", icon: "i-ph-file-ts" },
          { label: "home.ts", value: "src/home", icon: "i-ph-file-ts" },
        ],
      },
      {
        label: "docs",
        value: "docs",
        icon: "i-ph-folder",
        children: [
          { label: "README.md", value: "docs/readme", icon: "i-ph-file-text" },
        ],
      },
      {
        label: "package.json",
        value: "package",
        icon: "i-ph-package",
        selectable: false,
      },
    ],
  });
}
