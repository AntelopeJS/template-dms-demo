import { Logging } from "@antelopejs/interface-core/logging";
import {
  EnsureFunnel,
  EnsureWebsite,
  ImportAnalytics,
} from "@antelopejs/interface-dms-marketing";
import { isSupersededByReload } from "../media";
import { historyImports } from "./history";
import { HELIO_WEBSITE, helioFunnels } from "./site";

// Helio's public website in the marketing module, shipped as code: the site,
// its funnels (one A/B test running on the simulator, one finished on the
// contact form) and twelve weeks of imported traffic. Declarations are
// idempotent and keep the team's edits; each history import is applied once
// per import id, later boots answer "skipped".

async function declareMarketing(): Promise<void> {
  const now = Date.now();
  const site = await EnsureWebsite(HELIO_WEBSITE);
  const funnels = [];
  for (const funnel of helioFunnels(now)) {
    funnels.push(await EnsureFunnel(funnel));
  }
  Logging.Info(
    `[helio] marketing declared: website ${site.status}, funnels ${funnels.map((f) => `${f.id} ${f.status}`).join(", ")}`,
  );
  // After the funnels: an exposure only counts once its split left draft.
  for (const batch of historyImports(now)) {
    const result = await ImportAnalytics(batch);
    Logging.Info(
      `[helio] marketing history ${result.importId}: ${result.status}, ${result.sessions} visits, ${result.events} events, ${result.dropped} dropped`,
    );
  }
}

/** Declares the website content in the background; call it from start(). */
export function startHelioMarketing(): void {
  declareMarketing().catch((error: unknown) => {
    if (isSupersededByReload(error))
      Logging.Debug("[helio] marketing content: superseded by a reload");
    else Logging.Error(`[helio] marketing content failed: ${String(error)}`);
  });
}
