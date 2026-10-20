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
import { attachHqPlan, claimDefaultWorkspace } from "./default-workspace";
import { findOnboardingOwner, linkWorkspace, registerOwnerLink } from "./owner";
import { hasHelioPermissions, readGrantablePermissions } from "./permissions";
import { upkeepWorkspace } from "./upkeep";
import { grantNewPermissions, writeCatalogue } from "./write-catalogue";
import { writeWorkspace } from "./write-workspaces";
import { WORKSPACES } from "./workspaces";

const LOG_PREFIX = "[helio:saas]";
/** When the catalogue was first published, relative to the first boot. */
const CATALOGUE_AGE_DAYS = 540;
const MS_PER_DAY = 86_400_000;

interface SeedCounts {
  created: number;
  linked: number;
}

// The owner is looked up for each workspace: an onboarding completed while
// the seed runs still gets the workspaces written after it.
async function seedWorkspaces(
  grantable: string[],
  now: Date,
): Promise<SeedCounts> {
  const counts: SeedCounts = { created: 0, linked: 0 };
  for (const workspace of WORKSPACES) {
    if (await writeWorkspace(workspace, grantable, now)) counts.created++;
    const owner = await findOnboardingOwner();
    if (owner && (await linkWorkspace(workspace.id, owner))) counts.linked++;
    await upkeepWorkspace(workspace, now);
    await RecomputeTenantBillingState(workspace.id);
  }
  return counts;
}

async function seedSaasShowcase(): Promise<void> {
  const now = new Date();
  const grantable = await readGrantablePermissions();
  if (!hasHelioPermissions(grantable)) {
    Logging.Warn(`${LOG_PREFIX} Helio pages not registered yet, seed skipped`);
    return;
  }
  await attachHqPlan(now);
  await writeCatalogue(
    grantable,
    new Date(now.getTime() - CATALOGUE_AGE_DAYS * MS_PER_DAY),
  );
  await grantNewPermissions(grantable);
  await claimDefaultWorkspace();
  const { created, linked } = await seedWorkspaces(grantable, now);
  await writeDefaultBilling(now);
  await RecomputeTenantBillingState(DEFAULT_TENANT_ID);
  if (created > 0)
    Logging.Info(`${LOG_PREFIX} ${created} installer workspace(s) seeded`);
  if (linked > 0)
    Logging.Info(`${LOG_PREFIX} ${linked} workspace(s) given to the owner`);
}

async function runOnce(): Promise<void> {
  try {
    await seedSaasShowcase();
  } catch (error) {
    // The showcase must never keep the DMS from serving.
    Logging.Error(`${LOG_PREFIX} seed failed`, error);
  }
}

/**
 * Seeds on `DATABASE_INITIALIZED`: a sticky hook, so registered from
 * `construct()` it runs once the DMS start provisioned its schemas, and at
 * once after a hot reload of this module. Idempotent: rows with fixed ids are
 * only written while missing, so every boot can run it again.
 */
export function registerSaasShowcase(): void {
  registerOwnerLink();
  RegisterHook(Hook.DATABASE_INITIALIZED, () => {
    // Not awaited: the DMS start waits for its hook handlers, and the demo
    // data must not delay the dashboard.
    void runOnce();
    return undefined;
  });
}
