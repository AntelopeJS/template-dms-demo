import { journeyTests } from "./tests.mts";
import { deployJourneys } from "./journeys-deploy.mts";

journeyTests("deploy", deployJourneys);
