// The platform's default tenant is Helio SRL's own workspace, the one the
// owner account works in. dms-saas attaches the default free plan (Starter
// here) to a workspace without a subscription, which would cap its members to
// Starter's pages; the seed gives it the internal "Helio HQ" plan instead.
// The platform owner keeps every permission either way (`*` survives the plan
// intersection), but a colleague invited there must see the whole demo too.

import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { TenantSubscriptionModel } from "@antelopejs/interface-dms-saas/db";
import { PLAN_IDS } from "./plans";
import { insertMissing } from "./rows";

/** The name the DMS gives the default tenant when it creates it. */
const DMS_DEFAULT_NAME = "Default";
const PUBLISHER_NAME = "Helio SRL";

/**
 * Attaches Helio HQ to the default workspace: written before the plans, so the
 * default-plan backfill finds a subscription and leaves the workspace alone.
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

/**
 * Moves the default workspace off the default free plan dms-saas attached on
 * its own (before this seed ever ran); any other plan is an operator's choice.
 */
export async function claimDefaultWorkspace(): Promise<void> {
  const model = GetModel(TenantSubscriptionModel, DEFAULT_TENANT_ID);
  const subscription = await model.get(DEFAULT_TENANT_ID);
  if (
    subscription?.planId === PLAN_IDS.starter &&
    !subscription.stripeSubscriptionId &&
    !subscription.createdBy &&
    !subscription.domainTransition
  ) {
    await model.update(DEFAULT_TENANT_ID, { planId: PLAN_IDS.hq });
  }
  const tenants = GetModel(TenantModel);
  const tenant = await tenants.get(DEFAULT_TENANT_ID);
  if (tenant?.name === DMS_DEFAULT_NAME)
    await tenants.update(DEFAULT_TENANT_ID, { name: PUBLISHER_NAME });
}
