import { journeyTests } from "./harness.mts";
import { backendJourneys } from "./journeys-backend.mts";

journeyTests("backend", backendJourneys);
