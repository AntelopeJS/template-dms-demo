// Seed of helio_projects and helio_project_tasks, built from the project plan
// (projects/plan.ts): every project carries its signed quote's customer,
// budget and capacity, and its tasks follow the project's progress.

import { teamIdsByRole } from "../shared/roster";
import { createRng, DAY_MS, padId, type Rng } from "../shared/seed";
import type {
  Project,
  ProjectStatus,
  ProjectTask,
  ProjectTaskStatus,
  ProjectType,
} from "./database";
import { linesSubtotal } from "../sales/lines";
import { type ProjectPlan, projectPlans } from "./plan";

export type ProjectSeed = Pick<
  Project,
  | "_id"
  | "code"
  | "name"
  | "customer"
  | "quote"
  | "type"
  | "status"
  | "plannedStart"
  | "plannedEnd"
  | "leadTechnician"
  | "crew"
  | "address"
  | "capacityKwp"
  | "budget"
  | "notes"
>;

export type ProjectTaskSeed = Pick<
  ProjectTask,
  | "_id"
  | "project"
  | "title"
  | "status"
  | "assignee"
  | "dueDate"
  | "estimateHours"
  | "position"
>;

const OFFICE = teamIdsByRole("office");
const POSITION_STEP = 1000;

const TYPE_NAMES: Record<ProjectType, string> = {
  residential_pv: "Installation photovoltaïque",
  commercial_pv: "Centrale photovoltaïque",
  battery: "Batterie domestique",
  ev_charger: "Borne de recharge",
};

const NOTES: Partial<Record<ProjectStatus, string[]>> = {
  on_hold: [
    "En attente de l'accord de raccordement du gestionnaire de réseau.",
    "Le client a demandé de reporter le chantier après la rénovation de la toiture.",
    "Permis d'urbanisme en cours d'instruction à la commune.",
  ],
  inspection: [
    "Contrôle RGIE planifié, schéma unifilaire transmis à l'organisme agréé.",
  ],
  in_progress: ["Échafaudage livré la veille, accès par le jardin."],
};

function nameOf(plan: ProjectPlan): string {
  const size =
    plan.capacityKwp > 0
      ? ` ${plan.capacityKwp.toLocaleString("fr-BE")} kWc`
      : "";
  return `${TYPE_NAMES[plan.type]}${size} — ${plan.customer.name}`;
}

function toProject(rng: Rng, plan: ProjectPlan): ProjectSeed {
  const notes = NOTES[plan.status];
  return {
    _id: plan.projectId,
    code: `CH-${String(100 + plan.index).padStart(4, "0")}`,
    name: nameOf(plan),
    customer: plan.customer._id,
    quote: plan.quoteId,
    type: plan.type,
    status: plan.status,
    plannedStart: plan.start,
    plannedEnd: plan.end,
    leadTechnician: plan.leadTechnician,
    crew: plan.crew,
    address: plan.customer.address,
    capacityKwp: plan.capacityKwp,
    budget: linesSubtotal(plan.lines),
    notes: notes && rng.chance(0.8) ? rng.pick(notes) : undefined,
  };
}

let projects: ProjectSeed[] | undefined;

/** The 80 projects, `proj-001` … `proj-080`. */
export function buildProjects(): ProjectSeed[] {
  if (!projects) {
    const rng = createRng(0x9e110003);
    projects = projectPlans().map((plan) => toProject(rng, plan));
  }
  return projects;
}

// The steps of a project, in order: who does it (office or site crew), how
// long it takes, and when it is due relative to the start (days).
interface TaskTemplate {
  title: string;
  office?: boolean;
  hours: number;
  /** Days from the start; `end` for days from the planned end. */
  due: number | { end: number };
}

const COMMON_BEFORE: TaskTemplate[] = [
  { title: "Visite technique et relevé de toiture", hours: 2, due: -21 },
  { title: "Commande du matériel", office: true, hours: 1, due: -14 },
];

const TASKS: Record<ProjectType, TaskTemplate[]> = {
  residential_pv: [
    ...COMMON_BEFORE,
    {
      title: "Demande de raccordement au gestionnaire de réseau",
      office: true,
      hours: 1,
      due: -10,
    },
    { title: "Pose des rails et des panneaux", hours: 12, due: 0 },
    {
      title: "Câblage et mise en service de l'onduleur",
      hours: 4,
      due: { end: 0 },
    },
    { title: "Contrôle RGIE", office: true, hours: 2, due: { end: 7 } },
  ],
  commercial_pv: [
    ...COMMON_BEFORE,
    {
      title: "Étude de stabilité de la toiture",
      office: true,
      hours: 6,
      due: -18,
    },
    {
      title: "Demande de raccordement au gestionnaire de réseau",
      office: true,
      hours: 2,
      due: -12,
    },
    {
      title: "Échafaudage, structures et pose des panneaux",
      hours: 48,
      due: 0,
    },
    {
      title: "Raccordement des onduleurs triphasés",
      hours: 12,
      due: { end: -1 },
    },
    {
      title: "Contrôle RGIE et réception",
      office: true,
      hours: 3,
      due: { end: 7 },
    },
  ],
  battery: [
    ...COMMON_BEFORE,
    {
      title: "Installation de la batterie et de l'onduleur hybride",
      hours: 5,
      due: 0,
    },
    { title: "Paramétrage et mise à jour du firmware", hours: 1, due: 0 },
    { title: "Contrôle RGIE", office: true, hours: 1, due: { end: 7 } },
  ],
  ev_charger: [
    { title: "Visite technique du tableau électrique", hours: 1, due: -14 },
    { title: "Pose de la borne et tirage du câble", hours: 4, due: 0 },
    {
      title: "Configuration de la borne et du badge",
      hours: 1,
      due: { end: 0 },
    },
    { title: "Contrôle RGIE", office: true, hours: 1, due: { end: 7 } },
  ],
};

function dueDate(plan: ProjectPlan, template: TaskTemplate): Date {
  const from = typeof template.due === "number" ? plan.start : plan.end;
  const days =
    typeof template.due === "number" ? template.due : template.due.end;
  return new Date(from.getTime() + days * DAY_MS);
}

// How far a project has gone: the share of its tasks already done.
function doneShare(rng: Rng, status: ProjectStatus): number {
  switch (status) {
    case "done":
      return 1;
    case "inspection":
      return 0.8;
    case "in_progress":
      return 0.35 + rng.next() * 0.3;
    case "scheduled":
      return 0.3;
    case "on_hold":
      return 0.25;
    case "planned":
      return rng.chance(0.5) ? 0.15 : 0;
  }
}

function taskStatus(
  index: number,
  doneCount: number,
  status: ProjectStatus,
): ProjectTaskStatus {
  if (index < doneCount) return "done";
  if (
    index === doneCount &&
    (status === "in_progress" || status === "inspection")
  )
    return "doing";
  return "todo";
}

function tasksOf(
  rng: Rng,
  plan: ProjectPlan,
  startId: number,
): ProjectTaskSeed[] {
  const templates = TASKS[plan.type];
  const doneCount = Math.floor(templates.length * doneShare(rng, plan.status));
  const site = [plan.leadTechnician, ...plan.crew];
  return templates.map((template, index) => ({
    _id: padId("task", startId + index, 4),
    project: plan.projectId,
    title: template.title,
    status: taskStatus(index, doneCount, plan.status),
    assignee: template.office
      ? rng.pick(OFFICE)
      : index % 2 === 0
        ? plan.leadTechnician
        : rng.pick(site),
    dueDate: dueDate(plan, template),
    estimateHours: template.hours,
    position: (index + 1) * POSITION_STEP,
  }));
}

let tasks: ProjectTaskSeed[] | undefined;

/** Between 4 and 7 tasks per project, `task-0001` …, ordered by `position`. */
export function buildProjectTasks(): ProjectTaskSeed[] {
  if (!tasks) {
    const rng = createRng(0x9e110004);
    const all: ProjectTaskSeed[] = [];
    for (const plan of projectPlans())
      all.push(...tasksOf(rng, plan, all.length + 1));
    tasks = all;
  }
  return tasks;
}
