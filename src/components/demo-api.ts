import { Controller, Get, Parameter } from "@antelopejs/interface-api";

// Deterministic demo data for the period-aware components on the Dashboard
// page. Values only depend on the requested period, so the demo behaves the
// same on every machine.

interface Point {
  x: string;
  y: number;
}

interface Series {
  name: string;
  data: Point[];
  color?: string;
}

interface ChartCardPayload {
  value: number;
  previousValue: number;
  delta: number;
  series: Series[];
  comparisonSeries?: Series[];
}

interface KpiCardPayload {
  value: number;
  previousValue: number;
  delta: number;
  sparkline: number[];
}

interface TopListItemPayload {
  id: string;
  title: string;
  description?: string;
  value: number;
  delta?: number | null;
  sparkline?: number[];
  icon?: string;
}

const TOP_PRODUCTS = [
  {
    name: "Wireless headset Helix",
    category: "Audio",
    icon: "i-ph-headphones",
  },
  {
    name: "Mechanical keyboard Quartz",
    category: "Peripherals",
    icon: "i-ph-keyboard",
  },
  { name: "Smartwatch Orion", category: "Wearables", icon: "i-ph-watch" },
  { name: "USB-C hub Meteor", category: "Accessories", icon: "i-ph-usb" },
  { name: "4K webcam Lyra", category: "Peripherals", icon: "i-ph-webcam" },
  {
    name: "Bluetooth speaker Cosmos",
    category: "Audio",
    icon: "i-ph-speaker-high",
  },
  { name: "Gaming mouse Vega", category: "Peripherals", icon: "i-ph-mouse" },
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pseudoRandom(seed: number, index: number): number {
  const value = Math.sin(seed * 9973 + index * 7919) * 10000;
  return value - Math.floor(value);
}

function periodSeed(preset?: string, from?: string): number {
  return hashString(`${preset ?? "this-month"}:${from ?? ""}`);
}

function buildDailySeries(
  name: string,
  seed: number,
  min: number,
  max: number,
): Series {
  const days = 30;
  const today = new Date();
  const data: Point[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - index));
    return {
      x: date.toISOString().slice(0, 10),
      y: Math.round(min + pseudoRandom(seed, index) * (max - min)),
    };
  });
  return { name, data };
}

function buildSparkline(seed: number, min: number, max: number): number[] {
  return Array.from({ length: 12 }, (_, index) =>
    Math.round(min + pseudoRandom(seed, index) * (max - min)),
  );
}

function totalOf(series: Series): number {
  return series.data.reduce((acc, point) => acc + point.y, 0);
}

function deltaPercent(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export class ComponentsDemoApi extends Controller("/api/components-demo") {
  @Get("sales")
  getSales(
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("comparison", "query") comparison?: string,
  ): ChartCardPayload {
    const seed = periodSeed(preset, from);
    const current = buildDailySeries("Period", seed, 4500, 9500);
    const comparisonSeries =
      comparison && comparison !== "none"
        ? [buildDailySeries("Comparison", seed + 11, 4000, 10500)]
        : undefined;
    const currentTotal = totalOf(current);
    const previousTotal = comparisonSeries
      ? totalOf(comparisonSeries[0])
      : currentTotal;
    return {
      value: currentTotal,
      previousValue: previousTotal,
      delta: deltaPercent(currentTotal, previousTotal),
      series: [current],
      comparisonSeries,
    };
  }

  @Get("kpi/:metric")
  getKpi(
    @Parameter("metric", "param") metric: string,
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("comparison", "query") comparison?: string,
  ): KpiCardPayload {
    const metricSeeds: Record<string, number> = {
      revenue: 1,
      orders: 2,
      refunds: 3,
    };
    const seed = (metricSeeds[metric] ?? 4) * 17 + periodSeed(preset, from);
    const sparkline = buildSparkline(seed, 50, 250);
    const value = sparkline.reduce((acc, entry) => acc + entry, 0);
    const previousValue =
      comparison && comparison !== "none"
        ? Math.round(value * (0.8 + pseudoRandom(seed, 99) * 0.4))
        : value;
    return {
      value,
      previousValue,
      delta: deltaPercent(value, previousValue),
      sparkline,
    };
  }

  @Get("top-products")
  getTopProducts(
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("comparison", "query") comparison?: string,
  ): { items: TopListItemPayload[] } {
    const seed = periodSeed(preset, from);
    const withDelta = !!(comparison && comparison !== "none");
    const items = TOP_PRODUCTS.map((product, index) => ({
      id: `product-${index}`,
      title: product.name,
      description: product.category,
      value: Math.round(8000 + pseudoRandom(seed, index) * 45000),
      delta: withDelta
        ? Math.round((pseudoRandom(seed + 7, index) - 0.4) * 400) / 10
        : null,
      sparkline: buildSparkline(seed + index, 20, 60),
      icon: product.icon,
    })).sort((a, b) => b.value - a.value);
    return { items };
  }
}
