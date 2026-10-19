import { GetModel } from "@antelopejs/interface-database-decorators";
import type { AfterWrite } from "@antelopejs/interface-dms/base/types/guards";
import { logActivity } from "../dashboard/log";
import { cents } from "../shared/seed";
import {
  CustomerModel,
  type Deal,
  type DealStage,
  DealModel,
} from "./database";
import { STAGE_PROBABILITY } from "./fixtures";

// Some fields of a deal derive from others: its weighted amount (amount ×
// probability), whether it is still open (neither won nor lost), its
// customer's name (for the search), once closed, its probability, and the
// loss reason, kept on a lost deal only (the form hides it on the other
// stages, and a hidden field would otherwise keep the value it held). They
// are stored, not declared @Computed, for two reasons seen on this DMS
// version: the data API materializes a @Computed field only while a list
// sorts or filters on it (the grid and the footer summary would show
// nothing), and a controller with a @Computed field answers its `get` route
// with every relation set to null (the kanban, which saves the row it read,
// then fails on the mandatory customer). Every write of the pipeline table
// brings the stored values back in step.

// The probability the deal form starts from (deal-controller.ts).
const DEFAULT_PROBABILITY = STAGE_PROBABILITY.lead;

// A won deal is certain and a lost one gone, whatever probability it carried
// before; an open deal keeps the one its owner set.
const CLOSED_PROBABILITY: Partial<Record<DealStage, number>> = {
  won: STAGE_PROBABILITY.won,
  lost: STAGE_PROBABILITY.lost,
};

interface DerivedFields {
  probability: number;
  weightedAmount: number;
  isOpen: boolean;
  customerName: string;
  // null clears the stored value, as a field emptied in a form.
  lostReason: string | null;
}

function derive(deal: Deal, customerNames: Map<string, string>): DerivedFields {
  const probability = CLOSED_PROBABILITY[deal.stage] ?? deal.probability ?? 0;
  return {
    probability,
    weightedAmount: cents((deal.amount ?? 0) * probability),
    isOpen: deal.stage !== "won" && deal.stage !== "lost",
    customerName: customerNames.get(deal.customer) ?? "",
    lostReason: deal.stage === "lost" ? (deal.lostReason ?? null) : null,
  };
}

function isStale(deal: Deal, derived: DerivedFields): boolean {
  return (
    deal.probability !== derived.probability ||
    deal.weightedAmount !== derived.weightedAmount ||
    deal.isOpen !== derived.isOpen ||
    deal.customerName !== derived.customerName ||
    (deal.lostReason ?? null) !== derived.lostReason
  );
}

/** Rewrites the derived fields of the deals where they drifted. */
export async function syncDerivedFields(): Promise<void> {
  const model = GetModel(DealModel);
  const [deals, customers] = await Promise.all([
    model.getAll(),
    GetModel(CustomerModel).getAll(),
  ]);
  const names = new Map(customers.map(({ _id, name }) => [_id, name]));
  const updates = deals
    .map((deal) => ({ deal, derived: derive(deal, names) }))
    .filter(({ deal, derived }) => isStale(deal, derived));
  await Promise.all(
    updates.map(({ deal, derived }) => model.update(deal._id, derived)),
  );
}

// The probability a deal entering `stage` takes: the stage's default, unless
// the same write set one of its own (`sent` differs from `before`).
function stageProbability(
  stage: DealStage,
  sent: number | undefined,
  before: number | undefined,
): number | undefined {
  if (sent !== undefined && sent !== before) return undefined;
  return STAGE_PROBABILITY[stage];
}

/**
 * The pipeline table's new guard result: a deal created past the first stage
 * with the form's default probability takes its stage's. A guard does not
 * know the new row's id: the row is found by what was sent, then the derived
 * fields of every deal follow (a few hundred rows at most).
 */
export function afterDealNew(body: Partial<Deal>): AfterWrite {
  const sent = body.probability ?? DEFAULT_PROBABILITY;
  const probability = body.stage
    ? stageProbability(body.stage, sent, DEFAULT_PROBABILITY)
    : undefined;
  return async () => {
    if (probability !== undefined && probability !== sent) {
      const model = GetModel(DealModel);
      const created = (await model.getAll()).filter(
        (deal) =>
          deal.title === body.title &&
          deal.customer === body.customer &&
          deal.stage === body.stage &&
          deal.probability === sent,
      );
      await Promise.all(
        created.map((deal) => model.update(deal._id, { probability })),
      );
    }
    await syncDerivedFields();
  };
}

// A deal moved to "won" (across the board or from its form) reaches the
// dashboard's activity feed, in its owner's name.
async function logDealWon(id: string): Promise<void> {
  const deal = await GetModel(DealModel).get(id);
  if (deal?.stage !== "won") return;
  await logActivity({
    type: "deal_won",
    actor: deal.owner,
    subject: deal.title,
    record: { kind: "deal", id },
  });
}

/**
 * The pipeline table's edit guard result: a deal moved to another stage
 * (across the board or from its form) takes that stage's probability unless
 * the same edit set one, the derived fields follow, and a deal just won is
 * logged.
 */
export function afterDealEdit(
  id: string,
  body: Partial<Deal>,
  current: Partial<Deal>,
): AfterWrite {
  const { stage } = body;
  const moved = stage !== undefined && stage !== current.stage;
  const probability = moved
    ? stageProbability(stage, body.probability, current.probability)
    : undefined;
  return async () => {
    if (probability !== undefined) {
      await GetModel(DealModel).update(id, { probability });
    }
    await syncDerivedFields();
    if (moved && stage === "won") await logDealWon(id);
  };
}
