// SaaS showcase: Helio sold as a vertical ERP to solar and EV-charger
// installers. Seeds the dms-saas catalogue (features, plans gating Helio's
// pages) and a handful of installer workspaces with their subscriptions and
// invoices, so Modules › SaaS reads like a live business. The workspaces have
// no made-up people: they belong to the platform owner (owner.ts). Helio SRL's
// own workspace gets a billing history too (default-billing.ts).
//
// Stripe stays unconfigured in this demo. Paying workspaces carry a fake
// `sub_demo_…` subscription id: dms-saas only counts an active subscription
// as revenue when it is backed by one, and without it MRR, ARR and paying
// workspaces would all read zero. They carry no Stripe customer id, so the
// workspace pages make no Stripe call (card, balance); operator actions that
// write to Stripe (change plan, cancel, refund) fail on them by design.

import { Logging } from "@antelopejs/interface-core/logging";
import { RecomputeTenantBillingState } from "@antelopejs/interface-dms-saas/billing";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { writeDefaultBilling } from "./default-billing";
import { attachHqPlan, nameDefaultWorkspace } from "./default-workspace";
import { registerOwnerLink } from "./owner";
import { readGrantablePermissions } from "./permissions";
import { upkeepWorkspace } from "./upkeep";
import { grantNewPermissions, writeCatalogue } from "./write-catalogue";
import { writeWorkspace } from "./write-workspaces";
import { WORKSPACES } from "./workspaces";

const LOG_PREFIX = "[helio:saas]";
/** When the catalogue was first published, relative to the first boot. */
const CATALOGUE_AGE_DAYS = 540;
const MS_PER_DAY = 86_400_000;

/**
 * Writes the showcase once, when the DMS provisions its default tenant: the
 * catalogue, Helio SRL's own workspace and the installer workspaces. They
 * have no owner yet: the onboarding comes after, and its `MEMBER_ADDED` hands
 * them over (owner.ts).
 */
export async function provisionSaasShowcase(): Promise<void> {
  const now = new Date();
  const grantable = await readGrantablePermissions();
  // Before the plans, so dms-saas never attaches its default plan instead.
  await attachHqPlan(now);
  await writeCatalogue(
    grantable,
    new Date(now.getTime() - CATALOGUE_AGE_DAYS * MS_PER_DAY),
  );
  await nameDefaultWorkspace();
  for (const workspace of WORKSPACES) {
    await writeWorkspace(workspace, grantable, now);
    await upkeepWorkspace(workspace, now);
  }
  await writeDefaultBilling(now);
  await RecomputeTenantBillingState(DEFAULT_TENANT_ID);
  Logging.Info(
    `${LOG_PREFIX} ${WORKSPACES.length} installer workspace(s) seeded`,
  );
}

// The demo clock: each boot moves the installer workspaces' dates on, and the
// plans pick up the pages a Helio domain added since (a sticky hook, so this
// also runs at once after a hot reload of this module).
async function upkeepShowcase(): Promise<void> {
  try {
    await grantNewPermissions(await readGrantablePermissions());
    const now = new Date();
    for (const workspace of WORKSPACES) await upkeepWorkspace(workspace, now);
  } catch (error) {
    // The showcase must never keep the DMS from serving.
    Logging.Error(`${LOG_PREFIX} upkeep failed`, error);
  }
}

/**
 * Hands the installer workspaces to the onboarding owner, and keeps them
 * current on every boot. Not awaited: the DMS start waits for its hook
 * handlers, and the upkeep must not delay the dashboard.
 */
export function registerSaasShowcase(): void {
  registerOwnerLink();
  RegisterHook(Hook.DATABASE_INITIALIZED, () => {
    void upkeepShowcase();
    return undefined;
  });
}
