/**
 * Wording of automation objects the backend sends structured: a step, a
 * duration, a date. Every function takes the translator, so cells, cards and
 * the builder say the same thing in the reader's language. Triggers and
 * schedules are worded by the server, which sends their text next to them
 * (`src/runtime/wording.ts`), written with `useComposedText().processText`.
 */

/** `processI18n` of the DMS translation composable. */
export type Translate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

/** What starts a procedure or a run (see the backend `TriggerSummary`). */
export interface TriggerSummary {
  nodeId?: string;
  typeId: string;
  typeName: string;
  method?: string;
  path?: string;
  cron?: string;
  /** The time zone the schedule fires in, the server's. */
  timeZone?: string;
}

/** A trigger with the text the server words it as. */
export interface WordedTrigger extends TriggerSummary {
  text: BlockText;
}

/** A step, named by its label or the name of its type. */
export interface StepName {
  nodeId: string;
  label?: string;
  typeName?: string;
  kind?: string;
}

/** A step's name: its label, else its type's name, else its id. */
export function stepTitle(
  step: StepName | null | undefined,
  t: Translate,
): string {
  if (!step) return "";
  if (step.label) return step.label;
  if (step.typeName) return t(step.typeName);
  return step.nodeId;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/**
 * The reader's language, as the page declares it, for the formatters called
 * without one: dates and durations then follow the DMS language, not the
 * browser's.
 */
function pageLocale(locale?: string): string | undefined {
  if (locale) return locale;
  return typeof document === "undefined"
    ? undefined
    : document.documentElement.lang || undefined;
}

/** A duration in its most readable unit: "640 ms", "2.4 s", "3 min 4 s". */
export function describeDuration(
  ms: number | null | undefined,
  locale?: string,
): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < MS_PER_SECOND) return `${Math.round(ms)} ms`;
  const seconds = ms / MS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) {
    const value = new Intl.NumberFormat(pageLocale(locale), {
      maximumFractionDigits: 1,
    }).format(seconds);
    return `${value} s`;
  }
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes} min ${Math.round(seconds % SECONDS_PER_MINUTE)} s`;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

/** "4 min ago", "in 2 days": the distance from now, in the reader's locale. */
export function describeRelative(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "—";
  const ms = new Date(date).getTime() - Date.now();
  const format = new Intl.RelativeTimeFormat(pageLocale(locale), {
    numeric: "auto",
    style: "short",
  });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(ms) >= size || unit === "second") {
      return format.format(Math.round(ms / size), unit);
    }
  }
  return "";
}

/**
 * Builds the `Intl.DateTimeFormat` a date is written with: the page's
 * `useRegionalFormat().dateTimeFormat`, which adds the user's Language &
 * region settings (time zone, clock, date format) to what is asked for. An
 * explicit `timeZone` wins.
 */
export type DateTimeFormatOf = (
  options: Intl.DateTimeFormatOptions,
) => Intl.DateTimeFormat;

/**
 * How the reader writes hours: "09:05" on a 24-hour clock, "9:05 AM" on a
 * 12-hour one (never "09:05 AM").
 */
function hourStyle(formatOf: DateTimeFormatOf): "2-digit" | "numeric" {
  const { hourCycle } = formatOf({ hour: "numeric" }).resolvedOptions();
  return hourCycle === "h23" || hourCycle === "h24" ? "2-digit" : "numeric";
}

/**
 * A date and time, written the same way on every page: "Oct 12, 1:57 PM",
 * "12 oct., 13:57", with the year when it is not this one. Never all digits,
 * which reads month-first or day-first depending on the reader. In the
 * reader's time zone, or in `timeZone` when the text names it (a schedule's
 * next run, in the server's zone like the schedule itself).
 */
export function describeDateTime(
  date: string | Date | null | undefined,
  formatOf: DateTimeFormatOf,
  timeZone?: string,
): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const yearOf = (value: Date) =>
    formatOf({ year: "numeric", timeZone }).format(value);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: hourStyle(formatOf),
    minute: "2-digit",
    timeZone,
  };
  if (yearOf(d) !== yearOf(new Date())) options.year = "numeric";
  return formatOf(options).format(d);
}

/** "14:28" today, else the date and time: "Sep 22, 14:28". */
export function describeTime(
  date: string | Date | null | undefined,
  formatOf: DateTimeFormatOf,
): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const dayOf = (value: Date) =>
    formatOf({ year: "numeric", month: "numeric", day: "numeric" }).format(
      value,
    );
  if (dayOf(d) !== dayOf(new Date())) return describeDateTime(d, formatOf);
  return formatOf({ hour: hourStyle(formatOf), minute: "2-digit" }).format(d);
}

/** Pretty JSON for a payload or an output, `null` shown as such. */
export function prettyJson(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

/** Parse a stored payload string, keeping the text when it is not JSON. */
export function parsePayload(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * What a node does, in one line, from its settings (AU-10). A schedule reads
 * as `scheduleText`, its words as the server writes them, else as its cron
 * expression.
 */
export function summarizeNode(
  kind: string,
  typeId: string | undefined,
  config: Record<string, unknown> | undefined,
  t: Translate,
  scheduleText?: string,
): string {
  const c = config ?? {};
  const text = (key: string) =>
    typeof c[key] === "string" ? (c[key] as string) : "";
  if (kind === "trigger") {
    if (text("path")) return `${text("method") || "POST"} ${text("path")}`;
    return text("cron") ? (scheduleText ?? text("cron")) : "";
  }
  if (text("url")) return `${text("method") || "GET"} ${shortUrl(text("url"))}`;
  if (kind === "delay" && c.ms !== undefined)
    return describeDuration(Number(c.ms));
  if (text("message")) return `“${text("message")}”`;
  if (kind === "data" && c.value !== undefined && typeof c.value !== "object")
    return String(c.value);
  if (Array.isArray(c.cases))
    return (c.cases as unknown[]).map(String).join(" · ");
  if (typeof c.maxAttempts === "number")
    return t("$dms_automation.nodes.attempts", { n: c.maxAttempts });
  if (Array.isArray(c.ports))
    return (c.ports as unknown[]).map(String).join(" · ");
  if (kind === "setVariable" && text("name")) return `${text("name")} =`;
  return typeId && kind === "data" ? typeId : "";
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

/** The colour role of a node's category: trigger, flow, data, action. */
export type NodeRole =
  | "trigger"
  | "flow"
  | "data"
  | "action"
  | "helper"
  | "group";

export function roleOf(kind: string, category?: string): NodeRole {
  if (kind === "trigger") return "trigger";
  if (kind === "action") return "action";
  if (kind === "data") return "data";
  if (kind === "group") return "group";
  return category === "helper" ? "helper" : "flow";
}
