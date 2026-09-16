import { Category, pagesCategory } from "@antelopejs/interface-dms/page";

// Sidebar group with a small project-management demo app: users, projects
// and tasks backed by real Mongo collections with relations between them.
export const demoAppCategory = Category("demo-app", {
  displayName: "$demo.nav.demoApp",
  icon: "i-ph-app-window",
  order: 20,
  category: pagesCategory,
});
