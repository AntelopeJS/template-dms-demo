import { type MaybeRefOrGetter, toValue } from "vue";
import type { StepName, TriggerSummary } from "../utils/describe";

export type LogLevel = "info" | "warn" | "error";

export interface FireNode {
  id: string;
  parentFireId: string | null;
  sourceNodeId: string;
  port: string | null;
  ts: number;
  seq: number;
  iteration?: number;
  closedAt?: number;
}

export interface LogEntry {
  fireId: string;
  ts: number;
  seq: number;
  level: LogLevel;
  source: "log" | "exec";
  nodeId?: string;
  nodeKind?: string;
  message: string;
  value?: unknown;
}

export interface RunLog {
  fires: FireNode[];
  entries: LogEntry[];
  truncated?: number;
}

/** One execution of a step, read from the run's log by the backend. */
export interface TraceStep {
  nodeId: string;
  name: StepName;
  fireId: string;
  startMs: number;
  durationMs: number | null;
  /** `truncated`: its end was cut from the log to keep the run small. */
  status: "ok" | "failed" | "running" | "truncated";
  error?: string;
  inputs?: unknown;
  output?: unknown;
  /** 0 in the run's own flow, one more inside each loop, try or branch. */
  depth: number;
  /** Index in the trace's steps of the loop, retry, try or parallel step it ran under. */
  parent?: number;
  /** That step's port: `body`, `try`, `catch`, a parallel branch. */
  port?: string;
  /** The iteration or attempt of that step, from 0. */
  iteration?: number;
  /** The branch the step chose: `then`, a switch case, `exhausted`. */
  branch?: string;
  /** A failure a Try/Catch or a Retry around the step caught. */
  handled?: boolean;
}

/** A step of the graph the run did not reach, and why. */
export interface SkippedStep {
  nodeId: string;
  name: StepName;
  reason: "branch" | "stopped";
}

export interface RunRef {
  runId: string;
  startedAt: string;
  durationMs: number | null;
  stepDurations: Record<string, number | null>;
}

interface GraphNodeLite {
  id: string;
  kind: string;
  typeId?: string;
  label?: string;
  config?: Record<string, unknown>;
  position: { x: number; y: number };
}

interface GraphLite {
  nodes: GraphNodeLite[];
  triggerEdges: Array<{
    id: string;
    from: { node: string; branch?: string };
    to: { node: string; branch?: string };
  }>;
  dataEdges: Array<{
    id: string;
    from: { node: string; port: string };
    to: { node: string; field: string };
  }>;
}

/** A run next to another in its procedure's history. */
export interface RunNeighbour {
  runId: string;
  startedAt: string;
  status: string;
  errorMessage: string;
}

/** A run as `GET /runs/:id` answers it, with its trace. */
export interface RunDetail {
  _id: string;
  procedureId: string;
  startedAt: string;
  endedAt?: string | null;
  status: "ok" | "failed" | "cancelled";
  errorMessage?: string | null;
  triggerNodeId: string;
  triggerPayload?: string;
  payloadKept: boolean;
  kind: "run" | "rerun" | "test";
  rerunOf?: string;
  failedNodeId?: string;
  instanceId?: string;
  /** The version that ran; `null` for a test run of the builder's draft. */
  procedureVersion?: number | null;
  procedureName: string;
  durationMs: number;
  /** The log, when the run carries it; else read with `readLogs`. */
  logs?: RunLog;
  logCount?: number;
  logTruncated?: number;
  procedure: {
    _id: string;
    name: string;
    enabled: boolean;
    version: number;
  } | null;
  /** The graph drawn: the one that ran, else (`graphOutdated`) the current one. */
  graph: GraphLite | null;
  graphOutdated?: boolean;
  trigger: TriggerSummary | null;
  /** What started the run, worded by the server. */
  triggerText: BlockText;
  failedStep: StepName | null;
  trace: {
    steps: TraceStep[];
    skipped: SkippedStep[];
    edgesTaken?: string[];
    truncated?: number;
  };
  usualDurationMs: number | null;
  lastSuccess: RunRef | null;
  /** The runs of the same procedure and kind just before and after this one. */
  previous: RunNeighbour | null;
  next?: RunNeighbour | null;
  failuresInRow: number;
}

/** What `POST /runs/:id/rerun` answers: the new run and how it ended. */
export interface RerunResult {
  runId: string;
  status?: "ok" | "failed" | "cancelled";
  /** An i18n key (with `$`) to show when the new run failed. */
  warning?: string;
}

/**
 * The builder open on a run: its procedure, with this run's trace and, given
 * one, a step selected (its top-level node: a step inside a group selects the
 * group). The trace, the drawer and the path taken all link through it.
 */
export function builderRunUrl(
  builderUrl: string,
  run: RunDetail,
  nodeId?: string,
): string {
  const query = new URLSearchParams({
    selected: run.procedureId,
    run: run._id,
  });
  if (nodeId) query.set("node", nodeId.split("__")[0] ?? nodeId);
  return `${builderUrl}?${query}`;
}

/**
 * Whether the builder can show a run: not for a deleted procedure, and not
 * for a test, which ran a draft the builder does not have.
 */
export function opensInBuilder(run: RunDetail): boolean {
  return !!run.procedure && run.kind !== "test";
}

/** How a run read follows the page, as `useApiData` takes it. */
export interface RunReadOptions {
  /** `false` for a read the page's refreshes leave alone. */
  refreshOnPageRefresh?: boolean;
}

/** The run endpoints the drawer, the trace and the builder share. */
export function useAutomationRuns(apiUrl = "/api/automation") {
  const { $authFetch } = useAuthFetch();
  // A run id from the URL goes into a path: encoded, "../procedures" stays
  // a run id that does not exist instead of reaching another route.
  const runUrl = (id: string) => `${apiUrl}/runs/${encodeURIComponent(id)}`;

  return {
    /** One run, read with the page: nothing while `id` is empty. */
    readRun(
      id: MaybeRefOrGetter<string | null | undefined>,
      options?: RunReadOptions,
    ) {
      return useApiData<RunDetail>(() => {
        const value = toValue(id);
        return value ? runUrl(value) : null;
      }, options);
    },
    /** A run's log, read while `id` is set: nothing while it is empty. */
    readLogs(
      id: MaybeRefOrGetter<string | null | undefined>,
      options?: RunReadOptions,
    ) {
      return useApiData<RunLog>(() => {
        const value = toValue(id);
        return value ? `${runUrl(value)}/logs` : null;
      }, options);
    },
    /** One run, for the builder's lookups chained to a click or a write. */
    getRun(id: string): Promise<RunDetail> {
      return $authFetch<RunDetail>(runUrl(id));
    },
    rerun(id: string): Promise<RerunResult> {
      return $authFetch<RerunResult>(`${runUrl(id)}/rerun`, {
        method: "POST",
        body: {},
      });
    },
  };
}
