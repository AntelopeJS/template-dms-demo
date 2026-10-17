// A short excerpt of a Helio page declaration, shown on the home page.
// Copied verbatim from the file it names (lines left out are marked "// …"):
// update it when that page changes. Its `$helio.` keys are checked by the
// frontend i18n test like any other key of the backend.
export const HOME_EXCERPT = {
  file: "src/helio/service/page.ts",
  code: `@RegisterPage()
export class PageHelioService extends PageController(
  "service",
  {
    displayName: "$helio.service.page.name",
    description: "$helio.service.page.description",
    icon: "i-ph-lifebuoy",
    category: helioOperationsCategory,
    order: 1,
    live: { maxRate: 3 },
  },
  DefaultLayout({ fullWidth: true }),
) {
  static live = LiveToggle({
    variant: "pill",
    align: "right",
    missedLabel: "$helio.service.live.missed",
  });

  static stats = StatGroup({
    layout: "cards",
    columns: 4,
    label: "$helio.service.stats.label",
    fetchUrl: route("/stats"),
    realtimeTopic: SERVICE_TOPIC,
    skeletonCount: 4,
  });

  static table = TableView(ticketController, {
    caption: "$helio.service.table.caption",
    labelKey: "number",
    // …
    pinnedRows: { field: "pinned", equals: true },
    realtimeTopic: SERVICE_TOPIC,
    liveHold: {
      whileSearching: true,
      missedLabel: "$helio.service.live.newTickets",
    },
    // …
    views: ticketViews,
    tabs: ticketTabs,
    footer: ticketFooter,
    // …
  });
}`,
};
