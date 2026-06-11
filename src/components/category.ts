import {
  Category,
  pagesCategory,
} from "@antelopejs-private/cms/interfaces/cms/page";

// Sidebar group holding one page per built-in CMS component, each showing
// the most complete example of that component.
export const componentsCategory = Category("components", {
  displayName: "$demo.nav.components",
  icon: "i-ph-puzzle-piece",
  order: 10,
  category: pagesCategory,
});
