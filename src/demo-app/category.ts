import { RootCategory } from "@antelopejs/interface-dms/page";

// Top-level sidebar section, set apart from the component showcase, with a
// small project-management demo app: users, projects and tasks backed by real
// Mongo collections with relations between them. Ordered between the built-in
// Pages (1) and Modules (2) sections.
export const demoAppCategory = RootCategory("demo-app", {
  displayName: "$demo.nav.demoApp",
  icon: "i-ph-app-window",
  order: 1.5,
});
