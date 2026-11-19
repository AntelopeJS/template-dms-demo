import { journeyTests } from "./tests.mts";
import { deployJourneys } from "./journeys-deploy.mts";
import { projectJourneys } from "./journeys-project.mts";

journeyTests("project", { ...projectJourneys, ...deployJourneys });
