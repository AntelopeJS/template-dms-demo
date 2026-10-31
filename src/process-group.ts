import type { ChildProcess, SpawnOptions } from "node:child_process";

export interface StopTimings {
  interruptMs: number;
  terminateMs: number;
}

export function startGroup(
  _command: string,
  _args: string[],
  _options: SpawnOptions,
): ChildProcess {
  throw new Error("not implemented");
}

export function stopGroup(
  _child: ChildProcess,
  _timings: StopTimings,
): Promise<void> {
  return Promise.reject(new Error("not implemented"));
}
