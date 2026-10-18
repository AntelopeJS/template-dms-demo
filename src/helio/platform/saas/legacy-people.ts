// Clean-up of the people earlier versions of this seed made up: each installer
// workspace came with an owner and colleagues, written as accounts named
// `<workspace id>-<key>` (`helio-ws-enerlux-owner`, `helio-ws-enerlux-tech1`…)
// and as members of that workspace. The showcase now gives every workspace to
// the platform owner instead, so a database seeded before is brought in line:
// those memberships and accounts are deleted. Nothing else ever referenced
// them (they had no password, so no session, device or notification), and a
// database seeded since has none: the clean-up then only reads.

import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";

/** Whether `userId` is one of the made-up people of the workspace. */
export function isLegacySeedUser(workspaceId: string, userId: string): boolean {
  return userId.startsWith(`${workspaceId}-`);
}

/**
 * Deletes the made-up members of one workspace and their accounts.
 *
 * @returns How many were deleted
 */
export async function removeLegacyPeople(workspaceId: string): Promise<number> {
  const members = GetModel(TenantMemberModel, workspaceId);
  const users = GetModel(UserModel);
  const legacy = (await members.listAll()).filter((member) =>
    isLegacySeedUser(workspaceId, member.userId),
  );
  for (const member of legacy) {
    await members.delete(member._id);
    if (await users.get(member.userId)) await users.delete(member.userId);
  }
  return legacy.length;
}
