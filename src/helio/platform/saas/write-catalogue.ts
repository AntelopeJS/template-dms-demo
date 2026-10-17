// Writes the features and the plans once, then keeps each plan's permissions
// in step with the pages registered since: a new page must not be hidden from
// every workspace owner by a stale catalogue. Permissions are only ever
// added, never removed, so an operator's own grants survive; the payment
// provider references stay dms-saas's to write.

import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type Feature,
  FeatureModel,
  PlanModel,
} from "@antelopejs/interface-dms-saas/db";
import { FEATURES, type LocalizedText, type SeedFeature } from "./features";
import { permissionsOf } from "./permissions";
import { PLANS, type SeedPlan } from "./plans";
import { insertMissing, type SeedRow } from "./rows";

/** Every locale of a localized field is written at once. */
const ALL_LOCALES = "*";

// A feature without a tooltip or a unit holds one empty text per language, as
// the DMS form writes it: a localized field cannot be read back from a null.
const NO_TEXT: LocalizedText = { en: "", fr: "" };

function toFeatureRow(feature: SeedFeature): SeedRow {
  const { id, ...fields } = feature;
  return {
    ...fields,
    tooltip: fields.tooltip ?? NO_TEXT,
    unit: fields.unit ?? NO_TEXT,
    _id: id,
  };
}

function localizeAll(feature: Feature): Feature {
  return feature.localize(ALL_LOCALES);
}

function toPlanRow(
  plan: SeedPlan,
  grantable: string[],
  createdAt: Date,
): SeedRow {
  const { id, grant, features, ...fields } = plan;
  return {
    ...fields,
    _id: id,
    features: Object.entries(features).map(([featureId, value]) => ({
      featureId,
      value,
    })),
    permissions: permissionsOf(grant, grantable),
    paymentProviderRefs: {},
    borderColor: null,
    isActive: true,
    isDeleted: false,
    createdAt,
    updatedAt: createdAt,
  };
}

/** Writes the features and plans that are not stored yet. */
export async function writeCatalogue(
  grantable: string[],
  createdAt: Date,
): Promise<void> {
  await insertMissing(
    FeatureModel,
    FEATURES.map(toFeatureRow),
    undefined,
    localizeAll,
  );
  await insertMissing(
    PlanModel,
    PLANS.map((plan) => toPlanRow(plan, grantable, createdAt)),
  );
}

/** Adds to each seeded plan the ids its grant covers and it lacks. */
export async function grantNewPermissions(grantable: string[]): Promise<void> {
  const model = GetModel(PlanModel);
  for (const seeded of PLANS) {
    const plan = await model.get(seeded.id);
    if (!plan || plan.isDeleted) continue;
    const held = new Set(plan.permissions ?? []);
    const missing = permissionsOf(seeded.grant, grantable).filter(
      (id) => !held.has(id),
    );
    if (missing.length === 0) continue;
    await model.update(plan._id, { permissions: [...held, ...missing] });
  }
}
