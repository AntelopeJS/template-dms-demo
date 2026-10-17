// Creates each installer workspace once: its people, tenant instance, billing
// identity, membership and subscription. Rows go straight to the tables, as
// the dms-saas playground does: the membership hooks would try to sync seat
// counts with Stripe, which this demo does not reach. The tenant row is
// written last, so the default-plan backfill dms-saas runs every 15 minutes
// never sees a workspace without its subscription.

import { randomBytes, randomUUID } from "node:crypto";
import { Schema } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import {
  RoleModel,
  TenantMemberModel,
  TenantModel,
} from "@antelopejs/interface-dms/db";
import {
  type PaidUsagePeriod,
  TenantBillingInfoModel,
  TenantSubscriptionModel,
} from "@antelopejs/interface-dms-saas/db";
import { RecomputeTenantBillingState } from "@antelopejs/interface-dms-saas/billing";
import { addDays, addMonths, insertMissing, type SeedRow } from "./rows";
import { findPlan } from "./plans";
import { dunningSince, nextRenewal } from "./schedule";
import {
  type SeedPerson,
  type SeedWorkspace,
  stripeSubscriptionIdOf,
  userIdOf,
} from "./workspaces";

/** Bytes behind a 64-character auth key, the length the DMS mints. */
const AUTH_KEY_BYTES = 48;
const MEMBER_ROLE_SUFFIX = "member";
const VAT_VERIFIED = "verified";
/** Billing states Stripe would hold a subscription for. */
const BILLED_STATUSES = new Set([
  "active",
  "past_due",
  "trialing",
  "cancelled",
]);

/** When the workspace was created, relative to now. */
export function workspaceCreatedAt(workspace: SeedWorkspace, now: Date): Date {
  return addDays(addMonths(now, -workspace.ageMonths), -workspace.ageDays);
}

// No password: these accounts show who runs each workspace, nobody signs in
// with them (an account without a password hash never passes the login).
function toUserRow(
  workspace: SeedWorkspace,
  member: SeedPerson,
  createdAt: Date,
): SeedRow {
  return {
    _id: userIdOf(workspace, member),
    name: member.name,
    email: member.email,
    passwordChangedAt: null,
    avatar: null,
    language: member.language,
    authKey: randomBytes(AUTH_KEY_BYTES).toString("base64url"),
    isValidated: true,
    validationToken: null,
    validationRequestedAt: null,
    forgotPasswordToken: null,
    forgotPasswordRequestedAt: null,
    owner: false,
    lastActiveAt: null,
    twoFactorMethods: [],
    twoFactorSecret: null,
    twoFactorPendingSecret: null,
    twoFactorBackupCodes: [],
    twoFactorBackupCodesGeneratedAt: null,
    twoFactorBackupCodesSavedAt: null,
    twoFactorEmailCode: null,
    twoFactorEmailCodeRequestedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function memberRoleId(tenantId: string): string {
  return `${tenantId}:${MEMBER_ROLE_SUFFIX}`;
}

// Members hold every grantable id: the plan caps what they really get.
function memberRole(
  tenantId: string,
  permissions: string[],
  at: Date,
): SeedRow {
  return {
    _id: memberRoleId(tenantId),
    name: "Member",
    description: "Everything the workspace plan includes",
    permissions,
    createdAt: at,
    updatedAt: at,
  };
}

function toMemberRow(
  workspace: SeedWorkspace,
  member: SeedPerson,
  isTenantOwner: boolean,
  joinedAt: Date,
): SeedRow {
  const userId = userIdOf(workspace, member);
  return {
    _id: `${workspace.id}:${userId}`,
    userId,
    roleIds: isTenantOwner ? [] : [memberRoleId(workspace.id)],
    isTenantOwner,
    joinedAt,
    invitedBy: isTenantOwner ? null : userIdOf(workspace, workspace.owner),
  };
}

function paidUsagePeriods(
  workspace: SeedWorkspace,
  start: Date,
): PaidUsagePeriod[] {
  if (workspace.status === "trialing") return [];
  return [
    {
      stripeSubscriptionId: stripeSubscriptionIdOf(workspace),
      start,
      end: null,
    },
  ];
}

// A churned workspace is written active first and cancelled right after, so
// dms-saas records the revenue it took away (the churn figures read it).
function initialStatus(workspace: SeedWorkspace): string {
  return workspace.status === "cancelled" ? "active" : workspace.status;
}

function currentPeriodEnd(
  workspace: SeedWorkspace,
  createdAt: Date,
  now: Date,
): Date | null {
  if (workspace.trialDaysLeft !== undefined)
    return addDays(now, workspace.trialDaysLeft);
  return nextRenewal(workspace, createdAt, now);
}

function toSubscriptionRow(
  workspace: SeedWorkspace,
  createdAt: Date,
  now: Date,
): SeedRow {
  // A free plan never reaches Stripe: its workspace has no subscription there.
  const isBilled =
    BILLED_STATUSES.has(workspace.status) &&
    findPlan(workspace.planId).price > 0;
  const isPaid = isBilled && workspace.status !== "trialing";
  return {
    _id: workspace.id,
    // Every compare-and-set write of dms-saas expects a revision.
    revision: randomUUID(),
    planId: workspace.planId,
    status: initialStatus(workspace),
    stripeCustomerId: null,
    stripeSubscriptionId: isBilled ? stripeSubscriptionIdOf(workspace) : null,
    stripeCheckoutSessionId: null,
    completedCheckoutSessionId: null,
    cardFingerprint: null,
    currentPeriodEnd: isBilled
      ? currentPeriodEnd(workspace, createdAt, now)
      : null,
    pendingPlanId: null,
    pendingPlanChangeAt: null,
    domainTransition: null,
    deletionStartedAt: null,
    cronNotification: null,
    refundRequestedAt: null,
    deletionRequestedAt: null,
    deletionRequestedBy: null,
    pastDueSince:
      workspace.status === "past_due"
        ? dunningSince(workspace, createdAt, now)
        : null,
    freeUntil: null,
    isComplimentary: false,
    paidUsageStartedAt: isPaid ? createdAt : null,
    paidUsagePeriods: isPaid ? paidUsagePeriods(workspace, createdAt) : [],
    createdBy: userIdOf(workspace, workspace.owner),
    createdAt,
    updatedAt: now,
  };
}

function toBillingInfoRow(workspace: SeedWorkspace): SeedRow {
  return {
    ...workspace.billing,
    _id: workspace.id,
    vatVerificationStatus: workspace.billing.vatNumber ? VAT_VERIFIED : null,
  };
}

async function writePeople(
  workspace: SeedWorkspace,
  createdAt: Date,
  permissions: string[],
): Promise<void> {
  const { id } = workspace;
  const people = [workspace.owner, ...workspace.members];
  await insertMissing(
    UserModel,
    people.map((member) => toUserRow(workspace, member, createdAt)),
  );
  await insertMissing(RoleModel, [memberRole(id, permissions, createdAt)], id);
  await insertMissing(
    TenantMemberModel,
    [
      toMemberRow(workspace, workspace.owner, true, createdAt),
      ...workspace.members.map((member, index) =>
        toMemberRow(workspace, member, false, addDays(createdAt, index + 1)),
      ),
    ],
    id,
  );
}

async function cancelAfterPublishing(workspace: SeedWorkspace): Promise<void> {
  await RecomputeTenantBillingState(workspace.id);
  await GetModel(TenantSubscriptionModel, workspace.id).update(workspace.id, {
    status: "cancelled",
  });
}

/**
 * Writes one workspace when its subscription does not exist yet; a workspace
 * already seeded is left to dms-saas and to the daily upkeep.
 *
 * @returns Whether the workspace was created by this call
 */
export async function writeWorkspace(
  workspace: SeedWorkspace,
  permissions: string[],
  now: Date,
): Promise<boolean> {
  const { id } = workspace;
  if (await GetModel(TenantSubscriptionModel, id).table.get(id)) return false;
  const createdAt = workspaceCreatedAt(workspace, now);
  await Schema.get(TENANT_SCHEMA_NAME)?.createInstance(id);
  await writePeople(workspace, createdAt, permissions);
  await insertMissing(
    TenantBillingInfoModel,
    [toBillingInfoRow(workspace)],
    id,
  );
  await insertMissing(
    TenantSubscriptionModel,
    [toSubscriptionRow(workspace, createdAt, now)],
    id,
  );
  await insertMissing(TenantModel, [
    { _id: id, name: workspace.name, createdAt, updatedAt: createdAt },
  ]);
  if (workspace.status === "cancelled") await cancelAfterPublishing(workspace);
  return true;
}
