import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { sep } from "node:path";

import type { JourneyContext } from "@antelopejs/tooling-configs/verify";

type Scope = Pick<JourneyContext, "work" | "home">;

function listPids(): number[] {
  return readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name))
    .map(Number);
}

function orEmpty(read: () => string): string {
  try {
    return read();
  } catch {
    return "";
  }
}

/** The fields of `/proc/<pid>/stat` after the command name, which may itself hold spaces and parentheses. */
function statFields(pid: number): string[] {
  const stat = orEmpty(() => readFileSync(`/proc/${pid}/stat`, "utf8"));
  return stat.slice(stat.lastIndexOf(")") + 2).split(" ");
}

/** Whether a process exists and is not a zombie waiting for its parent. */
export function running(pid: number): boolean {
  const [state] = statFields(pid);
  return state !== undefined && state !== "" && state !== "Z";
}

function isUnder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}${sep}`);
}

function belongsTo(pid: number, scope: Scope): boolean {
  const cwd = orEmpty(() => readlinkSync(`/proc/${pid}/cwd`));
  if (isUnder(cwd, scope.work) || isUnder(cwd, scope.home)) return true;
  return orEmpty(() => readFileSync(`/proc/${pid}/environ`, "latin1"))
    .split("\0")
    .includes(`HOME=${scope.home}`);
}

/** Every running process of the journey: its working directory is under the journey's scratch folder or HOME, or it inherited the journey's HOME, wherever its parent went. */
export function journeyProcesses(scope: Scope): number[] {
  return listPids().filter(
    (pid) => pid !== process.pid && running(pid) && belongsTo(pid, scope),
  );
}

/** `roots` and every process below them by parent links. */
export function withDescendants(roots: number[]): number[] {
  const parents = new Map(listPids().map((pid) => [pid, statFields(pid)[1]]));
  const found = new Set(roots);
  for (let grew = true; grew;) {
    grew = false;
    for (const [pid, parent] of parents)
      if (!found.has(pid) && found.has(Number(parent))) {
        found.add(pid);
        grew = true;
      }
  }
  return [...found];
}
