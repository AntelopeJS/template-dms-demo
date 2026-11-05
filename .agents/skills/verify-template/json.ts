import type { HttpResult } from "@antelopejs/tooling-configs/verify";

/** A JSON value as the harness reads it from an HTTP answer. */
export type Json = Exclude<HttpResult["json"], undefined>;

/** A JSON object. */
interface JsonRecord {
  [key: string]: Json;
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJson(value: unknown): value is Json {
  if (isScalar(value)) return true;
  if (Array.isArray(value)) return value.every(isJson);
  return isPlainObject(value) && Object.values(value).every(isJson);
}

function isJsonRecord(value: Json | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIndex(step: string | number): step is number {
  return typeof step === "number";
}

/** True for a JSON string. */
function isString(value: Json | undefined): value is string {
  return typeof value === "string";
}

/** True for a JSON number. */
export function isNumber(value: Json | undefined): value is number {
  return typeof value === "number";
}

/** Parses JSON text; text that is not JSON reads as the text itself. */
export function parseJson(text: string): Json {
  try {
    const parsed: unknown = JSON.parse(text);
    return isJson(parsed) ? parsed : text;
  } catch {
    return text;
  }
}

/** Reads `value` down the given keys and indexes; `undefined` when a step is missing. */
export function pick(
  value: Json | undefined,
  ...path: (string | number)[]
): Json | undefined {
  let current = value;
  for (const step of path) {
    if (isIndex(step)) {
      current = Array.isArray(current) ? current[step] : undefined;
    } else {
      current =
        isJsonRecord(current) && Object.keys(current).includes(step)
          ? current[step]
          : undefined;
    }
  }
  return current;
}

/** The string `value` holds, or an empty string. */
export function text(value: Json | undefined): string {
  return isString(value) ? value : "";
}

/** The items of a JSON array, or none when the value is not one. */
export function items(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

/** The keys of a JSON object, sorted, or none when the value is not one. */
export function keys(value: Json | undefined): string[] {
  return isJsonRecord(value) ? Object.keys(value).sort() : [];
}
