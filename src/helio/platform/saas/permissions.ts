// Plan permissions computed from the permission tree the DMS holds now. The
// DMS counts a granted id only with every id above it, so a plan lists whole
// subtrees rather than single pages; and listing "everything except" keeps a
// page another domain adds later inside the plans by default.

import {
  GetPermissions,
  type PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import { BASE_EXCLUDED_SUBTREES, type PlanGrant } from "./plans";

function collectPermissionIds(tree: Record<string, PermissionTree>): string[] {
  return Object.values(tree).flatMap((node) => [
    ...(node.data ? [node.data.id] : []),
    ...collectPermissionIds(node.children),
  ]);
}

/** Every permission the DMS can grant now: pages, blocks and actions. */
export async function readGrantablePermissions(): Promise<string[]> {
  return [...new Set(collectPermissionIds(await GetPermissions()))];
}

function isUnder(id: string, prefix: string): boolean {
  return id === prefix || id.startsWith(`${prefix}.`);
}

function isUnderAny(id: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => isUnder(id, prefix));
}

/** The ids a plan holds itself, out of the grantable ones. */
export function permissionsOf(grant: PlanGrant, grantable: string[]): string[] {
  switch (grant.kind) {
    case "all":
      return grantable;
    case "base":
      return grantable.filter((id) => !isUnderAny(id, BASE_EXCLUDED_SUBTREES));
    case "subtrees":
      return grantable.filter((id) => isUnderAny(id, grant.prefixes));
  }
}

/**
 * Whether the Helio pages registered their permissions yet: on a hot reload
 * the seed may run before them, and a plan written then would miss them.
 */
export function hasHelioPermissions(grantable: string[]): boolean {
  return grantable.some((id) => isUnder(id, "helio"));
}
