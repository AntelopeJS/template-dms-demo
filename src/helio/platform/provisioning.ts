// Helio's data in the default tenant — the SaaS showcase, the e-mails, the
// media library and the public website — written once, when the DMS
// provisions that tenant: on the start that creates it, once every
// `DATABASE_INITIALIZED` handler has finished (the Helio collections are
// registered by then). From then on the data belongs to the tenant, and a
// later start writes none of it again.

import { Logging } from "@antelopejs/interface-core/logging";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { provisionHelioMailing } from "./mailing";
import { provisionHelioMarketing } from "./marketing";
import { provisionHelioMedia } from "./media";
import { provisionSaasShowcase } from "./saas";

interface ProvisioningStep {
  name: string;
  run: () => Promise<void>;
}

const STEPS: ProvisioningStep[] = [
  { name: "saas showcase", run: provisionSaasShowcase },
  { name: "mailing", run: provisionHelioMailing },
  { name: "media", run: provisionHelioMedia },
  { name: "marketing", run: provisionHelioMarketing },
];

/**
 * Writes Helio's default tenant data. A step that fails is logged and the
 * next one runs: Helio works without any of these modules, and a demo
 * shortfall must not cancel the default tenant.
 */
export function registerHelioProvisioning(): void {
  RegisterHook(Hook.TENANT_BEING_PROVISIONED, async ({ tenantId }) => {
    if (tenantId !== DEFAULT_TENANT_ID) return undefined;
    for (const step of STEPS) {
      try {
        await step.run();
      } catch (error) {
        Logging.Error(`[helio] ${step.name} provisioning failed`, error);
      }
    }
    return undefined;
  });
}
