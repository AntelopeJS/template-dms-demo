import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import { ChartLine } from "@antelopejs-private/cms/interfaces/cms-base";
import { componentsCategory } from "./category";

const REVENUE_2026 = [
  { x: "Jan", y: 14200 },
  { x: "Feb", y: 15800 },
  { x: "Mar", y: 14900 },
  { x: "Apr", y: 17600 },
  { x: "May", y: 19300 },
  { x: "Jun", y: 18100 },
  { x: "Jul", y: 20400 },
  { x: "Aug", y: 19800 },
  { x: "Sep", y: 22500 },
  { x: "Oct", y: 23900 },
  { x: "Nov", y: 23100 },
  { x: "Dec", y: 26400 },
];

const REVENUE_2025 = [
  { x: "Jan", y: 11900 },
  { x: "Feb", y: 12400 },
  { x: "Mar", y: 13100 },
  { x: "Apr", y: 12800 },
  { x: "May", y: 14600 },
  { x: "Jun", y: 15200 },
  { x: "Jul", y: 16100 },
  { x: "Aug", y: 15400 },
  { x: "Sep", y: 17300 },
  { x: "Oct", y: 18200 },
  { x: "Nov", y: 17800 },
  { x: "Dec", y: 20100 },
];

@RegisterPage()
export class PageComponentChart extends PageController("chart", {
  displayName: "$demo.nav.chart",
  icon: "i-ph-chart-line",
  category: componentsCategory,
  order: 1,
  description: "$demo.pages.chart.description",
}) {
  static revenue = ChartLine({
    title: "$demo.chart.revenue.title",
    description: "$demo.chart.revenue.description",
    staticDataset: [
      { name: "2026", data: REVENUE_2026, color: "#7c3aed" },
      { name: "2025", data: REVENUE_2025, color: "#94a3b8" },
    ],
    comparisonStyle: "dashed",
    smooth: true,
    strokeWidth: 3,
    showGrid: true,
    showLegend: true,
    showTooltip: true,
    xaxisType: "category",
    yRange: { min: 0, max: 30000 },
    height: "380px",
  });
}
