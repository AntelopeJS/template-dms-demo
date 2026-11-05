import { equal, type JourneyContext } from "@antelopejs/tooling-configs/verify";

import { DATABASE, mongo, sleep } from "./project.ts";

const PROVISIONING = `(() => { const tenant = db.getCollection("dms-core__tenants").findOne({ _id: "default" }); return tenant === null ? "absent" : tenant.provisioningPending === true ? "pending" : "done"; })()`;
const PROVISIONING_ATTEMPTS = 180;

/** Waits until the DMS has finished provisioning its default tenant in `database`, Helio's steps included: `provisioningPending` clears only when every step succeeded. */
export async function provisioned(
  context: JourneyContext,
  name: string,
  database = DATABASE,
): Promise<void> {
  let state = await mongo(context, name, PROVISIONING, database);
  for (
    let attempt = 1;
    attempt < PROVISIONING_ATTEMPTS && state.value !== "done";
    attempt += 1
  ) {
    await sleep(1000);
    state = await mongo(context, name, PROVISIONING, database);
  }
  context.expect(
    state.folder,
    [
      equal(
        "the default tenant's provisioning, Helio's steps included, completed",
        state.value,
        "done",
      ),
    ],
    { critical: true },
  );
}
