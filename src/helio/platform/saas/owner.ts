// Gives the installer workspaces to the platform owner: the person who
// completed the onboarding, who already owns the default workspace. That
// account does not exist when the fixtures first run (the onboarding comes
// after the first start), so the seed writes the workspaces without anybody,
// and they are linked as soon as the owner exists:
//
// - on every start and hot reload, by the seed, once the onboarding is done;
// - right after the onboarding, which adds its new account as owner of the
//   default workspace through the DMS membership API: `Hook.MEMBER_ADDED`
//   fires for the default tenant with `isTenantOwner`.
//
// The owner joins through `applyTenantOwnership`, the DMS membership API, so
// the membership hooks run: dms-saas checks the seat limit (flat plans, one
// seat taken) and refreshes the workspace directory its back office reads
// (owner name and e-mail, members, seats). Idempotent: a workspace that has an
// owner is left alone, so an ownership handed over to a colleague stays, and
// replaying it on every boot writes nothing.

import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel, TenantModel } from "@antelopejs/interface-dms/db";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { applyTenantOwnership } from "@antelopejs/interface-dms/tenant-ownership";
import { RecomputeTenantBillingState } from "@antelopejs/interface-dms-saas/billing";
import { TenantSubscriptionModel } from "@antelopejs/interface-dms-saas/db";
import { isLegacySeedUser, removeLegacyPeople } from "./legacy-people";
import { WORKSPACES } from "./workspaces";

const LOG_PREFIX = "[helio:saas]";

function createdTime(user: User): number {
  return new Date(user.createdAt).getTime();
}

/**
 * The account the onboarding created: the oldest platform owner, so one made
 * owner later never takes the workspaces over.
 *
 * @returns The owner, or undefined while the onboarding is not done
 */
export async function findOnboardingOwner(): Promise<User | undefined> {
  const owners = await GetModel(UserModel).getOwners();
  return owners.sort((a, b) => createdTime(a) - createdTime(b))[0];
}

/** Records the owner as the subscription's creator, unless someone is. */
async function claimSubscription(
  workspaceId: string,
  ownerId: string,
): Promise<boolean> {
  const model = GetModel(TenantSubscriptionModel, workspaceId);
  const subscription = await model.get(workspaceId);
  if (!subscription) return false;
  const creator = subscription.createdBy;
  if (creator && !isLegacySeedUser(workspaceId, creator)) return false;
  await model.update(workspaceId, { createdBy: ownerId });
  return true;
}

/**
 * Makes `owner` the owner of one seeded workspace when it has none, after
 * removing the made-up people an older seed gave it.
 *
 * @returns Whether anything changed, so the caller refreshes its billing state
 */
export async function linkWorkspace(
  workspaceId: string,
  owner: User,
): Promise<boolean> {
  if (!(await GetModel(TenantModel).get(workspaceId))) return false;
  let changed = (await removeLegacyPeople(workspaceId)) > 0;
  const owners = await GetModel(TenantMemberModel, workspaceId).listOwners();
  if (owners.length === 0) {
    await applyTenantOwnership(GetModel(UserModel), owner._id, workspaceId, {
      roleIds: [],
      isTenantOwner: true,
    });
    changed = true;
  }
  if (await claimSubscription(workspaceId, owner._id)) changed = true;
  return changed;
}

/** Links every seeded workspace to the onboarding owner, if there is one. */
async function linkAllWorkspaces(): Promise<void> {
  try {
    const owner = await findOnboardingOwner();
    if (!owner) return;
    let linked = 0;
    for (const workspace of WORKSPACES) {
      if (!(await linkWorkspace(workspace.id, owner))) continue;
      await RecomputeTenantBillingState(workspace.id);
      linked++;
    }
    if (linked > 0)
      Logging.Info(`${LOG_PREFIX} ${linked} workspace(s) given to the owner`);
  } catch (error) {
    // Runs off the onboarding request: it must never fail it.
    Logging.Error(`${LOG_PREFIX} linking the workspaces failed`, error);
  }
}

/**
 * Links the workspaces right after the onboarding: it adds the account it
 * creates as owner of the default workspace. Members joining the installer
 * workspaces (this linking included) and later colleagues are ignored.
 */
export function registerOwnerLink(): void {
  RegisterHook(Hook.MEMBER_ADDED, ({ tenantId, isTenantOwner }) => {
    if (tenantId !== DEFAULT_TENANT_ID || !isTenantOwner) return undefined;
    // Not awaited: the onboarding request waits for its hook handlers.
    void linkAllWorkspaces();
    return undefined;
  });
}
