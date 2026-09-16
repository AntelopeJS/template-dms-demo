import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCard,
  KpiCard,
  PeriodSelector,
  TopListCard,
} from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { componentsCategory } from "./category";

const SCOPE_ID = "components-dashboard";

// A complete dashboard combining PeriodSelector, KpiCard, ChartCard and
// TopListCard. Every card shares the same periodScope, so changing the
// period or the comparison refetches everything from the demo API.
@RegisterPage()
export class PageComponentDashboard extends PageController("dashboard", {
  displayName: "$demo.nav.dashboard",
  icon: "i-ph-chart-pie-slice",
  category: componentsCategory,
  order: 2,
  description: "$demo.pages.dashboard.description",
}) {
  static period = PeriodSelector({
    id: SCOPE_ID,
    defaultPreset: "last-30-days",
    defaultComparison: "previous-period",
    presets: [
      "today",
      "last-7-days",
      "last-30-days",
      "this-month",
      "this-quarter",
      "ytd",
      "custom",
    ],
    comparisons: ["none", "previous-period", "previous-year", "custom"],
    align: "right",
    size: "md",
    showRangeLabel: true,
  });

  static kpis = Grid({ gap: "1rem" }).child(
    "kpiRow",
    GridRow()
      .child(
        "revenue",
        KpiCard({
          title: "$demo.dashboard.revenue.title",
          description: "$demo.dashboard.revenue.description",
          icon: "i-lucide-euro",
          fetchUrl: "/api/components-demo/kpi/revenue",
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          currencyCode: "EUR",
          showDelta: true,
          showSparkline: true,
          sparklineAccent: "auto",
          compareLabel: "$demo.dashboard.compareLabel",
        }),
      )
      .child(
        "orders",
        KpiCard({
          title: "$demo.dashboard.orders.title",
          icon: "i-lucide-package",
          fetchUrl: "/api/components-demo/kpi/orders",
          periodScope: SCOPE_ID,
          valueFormat: "compact",
          showDelta: true,
          showSparkline: true,
          sparklineAccent: "info",
          compareLabel: "$demo.dashboard.compareLabel",
        }),
      )
      .child(
        "refunds",
        KpiCard({
          title: "$demo.dashboard.refunds.title",
          description: "$demo.dashboard.refunds.description",
          icon: "i-lucide-rotate-ccw",
          fetchUrl: "/api/components-demo/kpi/refunds",
          periodScope: SCOPE_ID,
          valueFormat: "compact",
          invert: true,
          showDelta: true,
          showSparkline: true,
          sparklineAccent: "error",
          compareLabel: "$demo.dashboard.compareLabel",
        }),
      ),
  );

  static main = Grid({ gap: "1rem" }).child(
    "mainRow",
    GridRow()
      .child(
        "sales",
        ChartCard({
          title: "$demo.dashboard.sales.title",
          description: "$demo.dashboard.sales.description",
          icon: "i-lucide-shopping-cart",
          fetchUrl: "/api/components-demo/sales",
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          currencyCode: "EUR",
          showDelta: true,
          showLegend: true,
          primaryLabel: "$demo.dashboard.sales.primaryLabel",
          comparisonLabel: "$demo.dashboard.sales.comparisonLabel",
          chart: ChartArea({
            comparisonStyle: "dashed",
            xaxisType: "datetime",
            fillOpacity: 0.35,
            smooth: true,
          }),
        }),
      )
      .child(
        "topProducts",
        TopListCard({
          title: "$demo.dashboard.topProducts.title",
          description: "$demo.dashboard.topProducts.description",
          fetchUrl: "/api/components-demo/top-products",
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          currencyCode: "EUR",
          showRank: true,
          highlightTopN: 3,
          rankColor: "primary",
          badgeColor: "primary",
          showDelta: true,
          showSparkline: true,
          sparklineAccent: "auto",
          maxHeight: "460px",
          emptyLabel: "$demo.dashboard.topProducts.empty",
        }),
      ),
  );
}
