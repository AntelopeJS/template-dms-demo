// Pages, data and routes of this Helio domain are imported from here.
import "./database";
import "./controller";
import "./page";

export { startServiceSimulator, stopServiceSimulator } from "./simulator";

// The ticket simulator is started by src/index.ts once the template schema is
// registered (HELIO_SIMULATORS=off keeps it off), and stopped with the module.
