// The platform's default tenant is Helio SRL's own workspace, the one the
// owner account works in. dms-saas would attach the default free plan
// (Starter here) to a workspace without a subscription, which would cap its
// members to Starter's pages; the showcase gives it the internal "Helio HQ"
// plan instead, when the DMS provisions it.
// The platform owner keeps every permission either way (`*` survives the plan
// intersection), but a colleague invited there must see the whole demo too.

import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { TenantSubscriptionModel } from "@antelopejs/interface-dms-saas/db";
import { PLAN_IDS } from "./plans";
import { insertMissing } from "./rows";

const PUBLISHER_NAME = "Helio SRL";

/**
 * Attaches Helio HQ to the default workspace: written before the plans, so the
 * workspace holds a subscription before dms-saas could attach its default plan.
 */
export async function attachHqPlan(now: Date): Promise<void> {
  await insertMissing(
    TenantSubscriptionModel,
    [
      {
        _id: DEFAULT_TENANT_ID,
        revision: randomUUID(),
        planId: PLAN_IDS.hq,
        status: "active",
        isComplimentary: false,
        paidUsagePeriods: [],
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeCheckoutSessionId: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    DEFAULT_TENANT_ID,
  );
}

/** Gives the default workspace the publisher's name, the DMS naming it "Default". */
export async function nameDefaultWorkspace(): Promise<void> {
  await GetModel(TenantModel).update(DEFAULT_TENANT_ID, {
    name: PUBLISHER_NAME,
  });
}
