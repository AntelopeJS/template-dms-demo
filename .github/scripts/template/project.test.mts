import { journeyTests } from "./harness.mts";
import { deployJourneys } from "./journeys-deploy.mts";
import { projectJourneys } from "./journeys-project.mts";

journeyTests("project", { ...projectJourneys, ...deployJourneys });
