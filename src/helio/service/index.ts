// Pages, data and routes of this Helio domain are imported from here.
import "./database";
import "./controller";
import "./page";
import { startServiceSimulator } from "./simulator";

export { startServiceSimulator, stopServiceSimulator } from "./simulator";

// The ticket simulator runs as soon as the domain loads (HELIO_SIMULATORS=off
// keeps it off); a reload replaces the previous timer rather than adding one.
// src/index.ts stops it with the module (stop() and destroy()).
startServiceSimulator();
