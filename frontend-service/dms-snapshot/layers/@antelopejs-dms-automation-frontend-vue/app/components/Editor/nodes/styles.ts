/**
 * Shared handle styling for the editor's node Vue components, from the theme's
 * tokens only (AU-15): trigger handles take the info role (the flow of
 * control), data handles the success role. Data handles of a group or a
 * sentinel can pick a colour per JSON schema type via `dataHandleStyle(port)`.
 */

import type {
  GroupPort,
  JsonSchema,
} from "../../../composables/useGraphConnect";

export const triggerStyle = {
  background: "var(--ui-info)",
  width: "10px",
  height: "10px",
};

export const dataStyle = {
  background: "var(--ui-success)",
  width: "8px",
  height: "8px",
};

const TYPE_COLORS: Record<string, string> = {
  string: "var(--ui-success)",
  number: "var(--ui-warning)",
  integer: "var(--ui-warning)",
  boolean: "var(--ui-error)",
  object: "var(--ui-secondary)",
  array: "var(--ui-info)",
  null: "var(--ui-text-dimmed)",
};

function schemaType(schema: JsonSchema | undefined): string {
  if (!schema) return "";
  const t = schema.type;
  if (Array.isArray(t)) return typeof t[0] === "string" ? (t[0] as string) : "";
  return typeof t === "string" ? t : "";
}

export function dataHandleStyle(port: Pick<GroupPort, "schema">): {
  background: string;
  width: string;
  height: string;
} {
  const color = TYPE_COLORS[schemaType(port.schema)] ?? "var(--ui-success)";
  return { background: color, width: "8px", height: "8px" };
}
