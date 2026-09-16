import {
  Category,
  pagesCategory,
} from "@antelopejs-private/dms/interfaces/dms/page";

// Sidebar group holding one page per built-in DMS component, each showing
// the most complete example of that component.
export const componentsCategory = Category("components", {
  displayName: "$demo.nav.components",
  icon: "i-ph-puzzle-piece",
  order: 10,
  category: pagesCategory,
});
