import {
  type ChildProcess,
  type SpawnOptions,
  spawn,
} from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export interface StopTimings {
  /** How long the group gets to exit after an interrupt before it is terminated. */
  interruptMs: number;
  /** How long the group gets to exit after a termination before it is killed. */
  terminateMs: number;
}

export const DEFAULT_STOP_TIMINGS: StopTimings = {
  interruptMs: 10_000,
  terminateMs: 5_000,
};

const POLL_MS = 50;

/**
 * Starts `command` as the leader of its own process group, so that `stopGroup` reaches everything it starts: the
 * package manager, the CLI and the sidecars a module spawns.
 */
export function startGroup(
  command: string,
  args: string[],
  options: SpawnOptions,
): ChildProcess {
  return spawn(command, args, { ...options, detached: true });
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    return;
  }
}

function groupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function goneWithin(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (groupExists(pid)) {
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
  return true;
}

/**
 * Stops every process of the group `child` leads: an interrupt first, then a termination, then a kill, each after
 * the time its step allows. Resolves once no process of the group is left.
 */
export async function stopGroup(
  child: ChildProcess,
  timings: StopTimings = DEFAULT_STOP_TIMINGS,
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  signalGroup(pid, "SIGINT");
  if (await goneWithin(pid, timings.interruptMs)) return;
  signalGroup(pid, "SIGTERM");
  if (await goneWithin(pid, timings.terminateMs)) return;
  signalGroup(pid, "SIGKILL");
  await goneWithin(pid, timings.terminateMs);
}
