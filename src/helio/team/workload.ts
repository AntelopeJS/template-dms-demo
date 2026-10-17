// Staffing figures of the team page, computed from the live tickets and
// projects: who holds which open tickets, who works on which site, and who is
// on a site today. Pure functions over loaded rows, so the routes stay thin.

import type { MeterProps } from "@antelopejs/interface-dms/base/meter";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import type { TopListItem } from "@antelopejs/interface-dms/base/top-list-card";
import type { ComposedText } from "@antelopejs/interface-dms/base/types/composed-text";
import type { Project } from "../projects/database";
import type { Ticket } from "../service/database";
import type { TeamMember } from "./database";

/** The rows every figure is computed from. */
export interface WorkloadRows {
  members: TeamMember[];
  tickets: Ticket[];
  projects: Project[];
  now: Date;
}

const OPEN_TICKET_STATUSES = new Set(["new", "open", "waiting"]);
// A project keeps its crew busy while it runs and until the inspection is
// signed off; a scheduled one counts once it starts within the planning
// horizon, so a site booked for December does not weigh on this fortnight.
const RUNNING_PROJECT_STATUSES = new Set(["in_progress", "inspection"]);
const PLANNING_HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

/** Where the service desk and the projects live, for the cards' links. */
const SERVICE_DESK_URL = "/helio/operations/service";
const PROJECTS_URL = "/helio/operations/projects";

const count = (value: number) => ({ type: "count", value }) as const;

const isOpen = (ticket: Ticket): boolean =>
  OPEN_TICKET_STATUSES.has(ticket.status);

const isTechnician = (member: TeamMember): boolean =>
  member.role === "technician";

/** Everyone working on a project: its lead and its crew, once each. */
function projectPeople(project: Project): Set<string> {
  const people = new Set(project.crew ?? []);
  if (project.leadTechnician) people.add(project.leadTechnician);
  return people;
}

/** Projects whose crew is on site right now: started, not yet over. */
function sitesToday(rows: WorkloadRows): Project[] {
  const now = rows.now.getTime();
  return rows.projects.filter(
    (project) =>
      project.status === "in_progress" &&
      new Date(project.plannedStart).getTime() <= now &&
      new Date(project.plannedEnd).getTime() >= now,
  );
}

function peopleOnSite(rows: WorkloadRows): Set<string> {
  const onSite = new Set<string>();
  for (const project of sitesToday(rows)) {
    for (const id of projectPeople(project)) onSite.add(id);
  }
  return onSite;
}

/** The team in four cells: headcount, availability, field and backlog. */
export function teamStats(rows: WorkloadRows): StatGroupItem[] {
  const { members } = rows;
  const technicians = members.filter(isTechnician);
  const byRole = (role: string) =>
    members.filter((member) => member.role === role).length;
  const online = members.filter((member) => member.online).length;
  const techIds = new Set(technicians.map((member) => member._id));
  const onSite = [...peopleOnSite(rows)].filter((id) => techIds.has(id));
  const open = rows.tickets.filter(isOpen);
  const unassigned = open.filter((ticket) => !ticket.assignee).length;
  const onTechs = open.filter(
    (ticket) => ticket.assignee && techIds.has(ticket.assignee),
  ).length;
  const perTech = technicians.length
    ? Math.round((onTechs / technicians.length) * 10) / 10
    : 0;

  return [
    {
      id: "headcount",
      icon: "i-ph-users-three",
      eyebrow: "$helio.team.stats.headcount",
      value: members.length,
      detail: {
        key: "$helio.team.stats.headcount_detail",
        params: {
          technicians: byRole("technician"),
          sales: byRole("sales"),
          office: byRole("office") + byRole("manager"),
        },
      },
    },
    {
      id: "available",
      icon: "i-ph-circle-wavy-check",
      tone: "success",
      eyebrow: "$helio.team.stats.available",
      value: online,
      detail: {
        key: "$helio.team.stats.available_detail",
        params: { count: count(members.length - online) },
      },
    },
    {
      id: "on-site",
      icon: "i-ph-hard-hat",
      tone: "warning",
      eyebrow: "$helio.team.stats.on_site",
      value: {
        key: "$helio.team.stats.on_site_value",
        params: { onSite: onSite.length, total: technicians.length },
      },
      detail: {
        key: "$helio.team.stats.on_site_detail",
        params: { count: count(sitesToday(rows).length) },
      },
      to: PROJECTS_URL,
    },
    {
      id: "tickets-per-tech",
      icon: "i-ph-lifebuoy",
      tone: unassigned ? "error" : "info",
      eyebrow: "$helio.team.stats.per_tech",
      value: perTech,
      detail: {
        key: "$helio.team.stats.per_tech_detail",
        params: { count: count(unassigned) },
      },
      detailTone: unassigned ? "error" : "neutral",
      to: SERVICE_DESK_URL,
    },
  ];
}

function avatarOf(member: TeamMember): TopListItem["avatar"] {
  return member.avatar ? { src: member.avatar, alt: member.name } : undefined;
}

/**
 * Open tickets per holder, the busiest first: every technician, plus anyone
 * else the desk handed a ticket to (billing questions go to the office).
 */
export function ticketLoad(rows: WorkloadRows): TopListItem[] {
  const now = rows.now.getTime();
  const open = rows.tickets.filter(isOpen);
  return rows.members
    .map((member) => {
      const held = open.filter((ticket) => ticket.assignee === member._id);
      const urgent = held.filter((t) => t.priority === "urgent").length;
      const late = held.filter(
        (t) => new Date(t.slaDueAt).getTime() < now,
      ).length;
      return { member, held: held.length, urgent, late };
    })
    .filter(({ member, held }) => held > 0 || isTechnician(member))
    .sort((a, b) => b.held - a.held || b.urgent - a.urgent)
    .map(({ member, held, urgent, late }) => ({
      id: member._id,
      title: member.name,
      description: {
        key: "$helio.team.load.tickets_detail",
        params: { urgent, late },
      },
      value: held,
      avatar: avatarOf(member),
      to: SERVICE_DESK_URL,
    }));
}

function isActiveSoon(project: Project, now: number): boolean {
  if (RUNNING_PROJECT_STATUSES.has(project.status)) return true;
  return (
    project.status === "scheduled" &&
    new Date(project.plannedStart).getTime() <= now + PLANNING_HORIZON_MS
  );
}

/**
 * Projects per technician over the next two weeks (running, in inspection or
 * starting soon), as lead or in the crew, busiest first.
 */
export function siteLoad(rows: WorkloadRows): TopListItem[] {
  const now = rows.now.getTime();
  const active = rows.projects.filter((project) => isActiveSoon(project, now));
  return rows.members
    .filter(isTechnician)
    .map((member) => {
      const lead = active.filter((p) => p.leadTechnician === member._id);
      const crew = active.filter(
        (p) =>
          p.leadTechnician !== member._id &&
          (p.crew ?? []).includes(member._id),
      );
      return { member, lead: lead.length, crew: crew.length };
    })
    .sort((a, b) => b.lead + b.crew - (a.lead + a.crew) || b.lead - a.lead)
    .map(({ member, lead, crew }) => ({
      id: member._id,
      title: member.name,
      description: {
        key: "$helio.team.load.sites_detail",
        params: { lead, crew },
      },
      value: lead + crew,
      avatar: avatarOf(member),
      to: PROJECTS_URL,
    }));
}

/** Technicians on a site today out of the whole field team. */
export function onSiteMeter(rows: WorkloadRows): MeterProps {
  const techIds = new Set(rows.members.filter(isTechnician).map((m) => m._id));
  const onSite = [...peopleOnSite(rows)].filter((id) => techIds.has(id));
  return {
    value: onSite.length,
    max: techIds.size,
    hint: {
      key: "$helio.team.capacity.on_site_hint",
      params: { count: count(sitesToday(rows).length) },
    },
  };
}

/** Who the open tickets sit with: technicians, the office, or nobody yet. */
export function ticketCoverageMeter(rows: WorkloadRows): MeterProps {
  const roles = new Map(rows.members.map((m) => [m._id, m.role]));
  const open = rows.tickets.filter(isOpen);
  const tally = { technician: 0, other: 0, nobody: 0 };
  for (const ticket of open) {
    const role = ticket.assignee ? roles.get(ticket.assignee) : undefined;
    if (!role) tally.nobody += 1;
    else if (role === "technician") tally.technician += 1;
    else tally.other += 1;
  }
  const segment = (
    value: number,
    key: string,
    tone: "primary" | "info" | "warning",
  ) => {
    const label: ComposedText = { key, params: { count: count(value) } };
    return { value, tone, label };
  };
  return {
    max: open.length,
    segments: [
      segment(
        tally.technician,
        "$helio.team.capacity.tickets_technicians",
        "primary",
      ),
      segment(tally.other, "$helio.team.capacity.tickets_office", "info"),
      segment(
        tally.nobody,
        "$helio.team.capacity.tickets_unassigned",
        "warning",
      ),
    ],
    valueLabel: {
      key: "$helio.team.capacity.tickets_value",
      params: { count: count(open.length) },
    },
  };
}

/** Members reachable now out of the whole team. */
export function availabilityMeter(rows: WorkloadRows): MeterProps {
  const online = rows.members.filter((member) => member.online).length;
  return {
    value: online,
    max: rows.members.length,
    hint: {
      key: "$helio.team.capacity.availability_hint",
      params: { count: count(rows.members.length - online) },
    },
  };
}
