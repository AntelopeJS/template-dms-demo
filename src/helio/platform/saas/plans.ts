// The Helio price list. Helio SRL built its ERP for its own installation
// business and now sells it to other solar and EV-charger installers: Starter
// for independents, Pro and Business for growing teams, Enterprise for
// networks. Each tier inherits the previous one and adds the Helio pages it
// unlocks, so a plan's permissions really gate the dashboard.

import type {
  PlanAudience,
  PlanBillingMode,
  PlanInterval,
} from "@antelopejs/interface-dms-saas/db";
import { PLAN_UNLIMITED } from "@antelopejs/interface-dms-saas/db";
import { FEATURE_IDS } from "./features";

export const PLAN_IDS = {
  starter: "helio-plan-starter",
  pro: "helio-plan-pro",
  business: "helio-plan-business",
  enterprise: "helio-plan-enterprise",
  hq: "helio-plan-hq",
} as const;

/** Which permission ids a plan holds itself (inherited ones excluded). */
export type PlanGrant =
  /** Every registered id outside the paid add-ons and the demo-only pages. */
  | { kind: "base" }
  /** Every registered id under these subtrees. */
  | { kind: "subtrees"; prefixes: readonly string[] }
  /** Every registered id: the publisher's own workspace. */
  | { kind: "all" };

export interface SeedPlan {
  id: string;
  slug: string;
  name: string;
  description: string;
  audience: PlanAudience;
  /** In major units of `currency`, as the plan editor stores it. */
  price: number;
  currency: string;
  interval: PlanInterval;
  billingMode: PlanBillingMode;
  trialDays: number;
  maxMembers: number;
  isPublic: boolean;
  order: number;
  borderLabel: string | null;
  inheritsFromPlanId: string | null;
  grant: PlanGrant;
  features: Record<string, boolean | number>;
}

// The component catalogue under Pages is the template's showcase of raw
// blocks, not part of the product sold to installers.
const DEMO_ONLY_SUBTREES = ["pages.components"];

// Unlocked by Pro: selling as a team and running after-sales service.
export const PRO_SUBTREES = [
  "helio.sales.pipeline",
  "helio.operations.service",
  "helio.operations.team",
];

// Unlocked by Business: live supervision of the installed fleet.
export const BUSINESS_SUBTREES = ["helio.monitoring"];

/** What the base plan leaves out: the add-ons and the demo-only pages. */
export const BASE_EXCLUDED_SUBTREES = [
  ...DEMO_ONLY_SUBTREES,
  ...PRO_SUBTREES,
  ...BUSINESS_SUBTREES,
];

const F = FEATURE_IDS;
const EUR = "EUR";

export const PLANS: SeedPlan[] = [
  {
    id: PLAN_IDS.starter,
    slug: "starter",
    name: "Starter",
    description:
      "For independent installers: customers, catalogue, quotes, installation projects and invoices.",
    audience: "individual",
    price: 0,
    currency: EUR,
    interval: "month",
    billingMode: "flat",
    trialDays: 0,
    maxMembers: 2,
    isPublic: true,
    order: 1,
    borderLabel: null,
    inheritsFromPlanId: null,
    grant: { kind: "base" },
    features: {
      [F.users]: 2,
      [F.quotes]: true,
      [F.pipeline]: false,
      [F.serviceDesk]: false,
      [F.fleet]: false,
      [F.sites]: 0,
      [F.automation]: false,
      [F.api]: false,
      [F.storage]: 2,
      [F.support]: 48,
      [F.sso]: false,
    },
  },
  {
    id: PLAN_IDS.pro,
    slug: "pro",
    name: "Pro",
    description:
      "For growing installer teams: sales pipeline, service desk with SLA and team planning.",
    audience: "any",
    price: 89,
    currency: EUR,
    interval: "month",
    billingMode: "flat",
    trialDays: 14,
    maxMembers: 5,
    isPublic: true,
    order: 2,
    borderLabel: null,
    inheritsFromPlanId: PLAN_IDS.starter,
    grant: { kind: "subtrees", prefixes: PRO_SUBTREES },
    features: {
      [F.users]: 5,
      [F.pipeline]: true,
      [F.serviceDesk]: true,
      [F.storage]: 25,
      [F.support]: 24,
    },
  },
  {
    id: PLAN_IDS.business,
    slug: "business",
    name: "Business",
    description:
      "For established installers with a fleet to maintain: live monitoring of every installed site, automation and API.",
    audience: "business",
    price: 219,
    currency: EUR,
    interval: "month",
    billingMode: "flat",
    trialDays: 14,
    maxMembers: 15,
    isPublic: true,
    order: 3,
    borderLabel: "Most popular",
    inheritsFromPlanId: PLAN_IDS.pro,
    grant: { kind: "subtrees", prefixes: BUSINESS_SUBTREES },
    features: {
      [F.users]: 15,
      [F.fleet]: true,
      [F.sites]: 500,
      [F.automation]: true,
      [F.api]: true,
      [F.storage]: 100,
      [F.support]: 8,
    },
  },
  {
    id: PLAN_IDS.enterprise,
    slug: "enterprise",
    name: "Enterprise",
    description:
      "For multi-branch installers and franchise networks: unlimited users and sites, SSO and a dedicated success manager. Billed yearly.",
    audience: "business",
    price: 4990,
    currency: EUR,
    interval: "year",
    billingMode: "flat",
    trialDays: 0,
    maxMembers: PLAN_UNLIMITED,
    isPublic: true,
    order: 4,
    borderLabel: null,
    inheritsFromPlanId: PLAN_IDS.business,
    grant: { kind: "subtrees", prefixes: [] },
    features: {
      [F.users]: PLAN_UNLIMITED,
      [F.sites]: PLAN_UNLIMITED,
      [F.storage]: 1000,
      [F.support]: 2,
      [F.sso]: true,
    },
  },
  {
    // The publisher's own workspace (the platform's default tenant) runs on
    // this hidden plan: every page, so the owner account and any colleague
    // invited there see the whole demo. Priced 0 and reserved to businesses,
    // so dms-saas never picks it as the default plan of a sign-up.
    id: PLAN_IDS.hq,
    slug: "helio-hq",
    name: "Helio HQ",
    description:
      "Internal workspace of Helio SRL, the publisher of Helio. Every module, not for sale.",
    audience: "business",
    price: 0,
    currency: EUR,
    interval: "month",
    billingMode: "flat",
    trialDays: 0,
    maxMembers: PLAN_UNLIMITED,
    isPublic: false,
    order: 99,
    borderLabel: null,
    inheritsFromPlanId: null,
    grant: { kind: "all" },
    features: {
      [F.users]: PLAN_UNLIMITED,
      [F.quotes]: true,
      [F.pipeline]: true,
      [F.serviceDesk]: true,
      [F.fleet]: true,
      [F.sites]: PLAN_UNLIMITED,
      [F.automation]: true,
      [F.api]: true,
      [F.storage]: 1000,
      [F.support]: 2,
      [F.sso]: true,
    },
  },
];

/** The plan of `id`; throws on a typo in the seed data. */
export function findPlan(id: string): SeedPlan {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`[helio:saas] unknown plan ${id}`);
  return plan;
}
