import { GetModel } from "@antelopejs/interface-database-decorators";
import type { AfterWrite } from "@antelopejs/interface-dms/base/types/guards";
import { cents } from "../shared/seed";
import { type Deal, DealModel } from "./database";

// Two fields of a deal derive from others: its weighted amount (amount ×
// probability) and whether it is still open (neither won nor lost). They are
// stored, not declared @Computed, for two reasons seen on this DMS version:
// the data API materializes a @Computed field only while a list sorts or
// filters on it (the grid and the footer summary would show nothing), and a
// controller with a @Computed field answers its `get` route with every
// relation set to null (the kanban, which saves the row it read, then fails
// on the mandatory customer). Every write of the pipeline table brings the
// stored values back in step.

interface DerivedFields {
  weightedAmount: number;
  isOpen: boolean;
}

function derive(deal: Deal): DerivedFields {
  return {
    weightedAmount: cents((deal.amount ?? 0) * (deal.probability ?? 0)),
    isOpen: deal.stage !== "won" && deal.stage !== "lost",
  };
}

function isStale(deal: Deal, derived: DerivedFields): boolean {
  return (
    deal.weightedAmount !== derived.weightedAmount ||
    deal.isOpen !== derived.isOpen
  );
}

/** Rewrites the derived fields of the deals where they drifted. */
async function syncDerivedFields(): Promise<void> {
  const model = GetModel(DealModel);
  const deals = await model.getAll();
  const updates = deals
    .map((deal) => ({ deal, derived: derive(deal) }))
    .filter(({ deal, derived }) => isStale(deal, derived));
  await Promise.all(
    updates.map(({ deal, derived }) => model.update(deal._id, derived)),
  );
}

/**
 * A guard result for the pipeline table's new and edit actions: once the
 * deal is written, its derived fields follow. A guard does not know the new
 * row's id, hence the sweep (a few hundred rows at most).
 */
export function afterDealWrite(): AfterWrite {
  return syncDerivedFields;
}
