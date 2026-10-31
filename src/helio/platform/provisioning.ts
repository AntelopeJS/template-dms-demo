import { Logging } from "@antelopejs/interface-core/logging";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { provisionHelioMailing } from "./mailing";
import { pinWebhookSecret } from "./mailing/webhook-secret";
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
  { name: "mailing webhook secret", run: pinWebhookSecret },
  { name: "media", run: provisionHelioMedia },
  { name: "marketing", run: provisionHelioMarketing },
];

/**
 * Writes Helio's data in the default tenant (the SaaS showcase, the e-mails,
 * the media library and the public website) when the DMS provisions that
 * tenant. From then on the data belongs to the tenant: a later start does not
 * write it again. A step that fails is logged and the next one runs: Helio
 * works without any of these modules, and a demo shortfall must not cancel the
 * default tenant.
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
