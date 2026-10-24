// A project starting on site or finished reaches the dashboard's activity
// feed, in the name of its lead technician: "CH-0123 · name".

import { GetModel } from "@antelopejs/interface-database-decorators";
import { logActivity } from "../dashboard/log";
import { ProjectModel } from "./database";

const LOGGED: Partial<Record<string, "project_started" | "project_done">> = {
  in_progress: "project_started",
  done: "project_done",
};

/** Logs a project that just moved to `status` (read once written). */
export async function logProjectStatus(
  id: string,
  status: string,
): Promise<void> {
  const type = LOGGED[status];
  const project = await GetModel(ProjectModel).get(id);
  if (!type || !project || project.status !== status) return;
  await logActivity({
    type,
    actor: project.leadTechnician ?? "",
    subject: `${project.code} · ${project.name}`,
    record: { kind: "project", id },
  });
}

/**
 * A guard result for the projects table's edit: a project moved on site or
 * to done (from its form or across the board) is logged once written.
 */
export function afterProjectEdit(
  id: string,
  status: string | undefined,
  previous: string | undefined,
): (() => Promise<void>) | undefined {
  if (!status || status === previous || !LOGGED[status]) return undefined;
  return () => logProjectStatus(id, status);
}
