import { ref } from "vue";
import { type RerunResult, useAutomationRuns } from "./useAutomationRuns";

/**
 * "Re-run with this payload", shared by the run drawer, the trace and the
 * builder: it asks first, in the server's words (side effects are real, the
 * procedure may be paused, some headers are replayed redacted, or the run
 * cannot be re-run at all), runs, says how the new run ended and opens its
 * trace.
 */
export function useRunActions(options: { apiUrl: string; traceUrl: string }) {
  const { t } = useI18n();
  const { processI18n } = useTranslation();
  const { confirmFrom } = useConfirmFrom();
  const toast = useToast();
  const router = useDmsRouter();
  const runs = useAutomationRuns(options.apiUrl);
  const rerunning = ref(false);
  let asking = false;

  async function rerun(runId: string, procedureName: string): Promise<void> {
    // A second click while the first is under way does nothing: the button
    // shows it loading. The server also refuses a re-run asked twice in a
    // row, and the dialog shows its message.
    if (asking || rerunning.value) return;
    asking = true;
    let result: RerunResult | undefined;
    try {
      await confirmFrom(`${options.apiUrl}/runs/{id}/rerun-confirm`, {
        params: { id: runId, name: procedureName },
        fallback: { color: "warning", icon: "i-ph-arrow-clockwise" },
        onConfirm: async () => {
          rerunning.value = true;
          try {
            result = await runs.rerun(runId);
          } finally {
            rerunning.value = false;
          }
        },
      });
    } finally {
      asking = false;
    }
    if (!result) return;
    const failed = result.status === "failed";
    toast.add({
      title: failed
        ? t("dms_automation.trace.rerunFailed", { name: procedureName })
        : t("dms_automation.runs.rerunDone", { name: procedureName }),
      description: result.warning ? processI18n(result.warning) : undefined,
      color: failed ? "error" : "success",
      icon: failed ? "i-ph-x-circle" : "i-ph-check-circle",
    });
    await router.push(
      `${options.traceUrl}?run=${encodeURIComponent(result.runId)}`,
    );
  }

  return { rerun, rerunning };
}
