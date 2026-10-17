// The backbone every operations fixture hangs on: one entry per installation
// project, built from an accepted quote. Quotes (sales), projects and their
// tasks, monitored sites, invoices and the activity feed all read this plan,
// so a won deal, its signed quote, the project on site, the invoices and the
// finished installation always tell the same story.

import type { QuoteLine } from "../sales/database";
import {
  buildLines,
  fitPvLines,
  type InstallationType,
  VAT_BUSINESS,
  VAT_RESIDENTIAL,
} from "../sales/lines";
import {
  COUNTS,
  dealId,
  projectId,
  quoteId,
  teamIdsByRole,
} from "../shared/roster";
import { createRng, DAY_MS, daysFromNow, type Rng } from "../shared/seed";
import {
  activeCustomers,
  type CustomerFacts,
  customerFacts,
  dealFacts,
  isBusiness,
} from "./crm-facts";
import type { ProjectStatus } from "./database";

export interface ProjectPlan {
  /** 1-based, shared by the project and its accepted quote. */
  index: number;
  projectId: string;
  quoteId: string;
  /** The won deal the quote closed, for half of the projects. */
  dealId?: string;
  customer: CustomerFacts;
  type: InstallationType;
  status: ProjectStatus;
  start: Date;
  end: Date;
  signedAt: Date;
  lines: QuoteLine[];
  capacityKwp: number;
  vatRate: number;
  leadTechnician: string;
  crew: string[];
}

const TECHNICIANS = teamIdsByRole("technician");

// Status by position: the oldest projects are finished, the newest planned,
// so every column of the planning and the kanban is populated.
function statusOf(index: number): ProjectStatus {
  if (index <= 46) return "done";
  if (index <= 51) return "inspection";
  if (index <= 60) return "in_progress";
  if (index <= 70) return "scheduled";
  if (index <= 76) return "planned";
  return "on_hold";
}

// Half of the projects come from the 40 won deals (odd indexes); the others
// are direct orders from existing customers (a battery, a charger, a roof).
function customerOf(
  rng: Rng,
  index: number,
): { customer: CustomerFacts; dealId?: string } {
  if (index % 2 === 1) {
    const deal = dealFacts(dealId((index + 1) / 2));
    return { customer: customerFacts(deal.customer), dealId: deal._id };
  }
  return { customer: rng.pick(activeCustomers()) };
}

// Finished projects are nearly all solar arrays, so 40 of them can become
// monitored sites; the open ones mix in batteries and chargers.
function typeOf(
  rng: Rng,
  index: number,
  business: boolean,
  fromDeal: boolean,
): InstallationType {
  const pv: InstallationType = business ? "commercial_pv" : "residential_pv";
  if (index <= 46) {
    if (index % 8 !== 0) return pv;
    return business
      ? "ev_charger"
      : rng.pick(["battery", "ev_charger"] as const);
  }
  // A won deal always sold a solar array (its title says how many kWc).
  if (fromDeal) return pv;
  if (business) return rng.chance(0.5) ? pv : "ev_charger";
  return rng.weighted<InstallationType>([
    ["residential_pv", 45],
    ["battery", 35],
    ["ev_charger", 20],
  ]);
}

function durationDays(
  rng: Rng,
  type: InstallationType,
  business: boolean,
): number {
  switch (type) {
    case "residential_pv":
      return rng.int(2, 4);
    case "commercial_pv":
      return rng.int(8, 25);
    case "battery":
      return 1;
    case "ev_charger":
      return business ? rng.int(2, 4) : 1;
  }
}

// Day offsets (from today) of the start, by status.
function startDay(
  rng: Rng,
  index: number,
  status: ProjectStatus,
  duration: number,
): number {
  switch (status) {
    case "done":
      return -340 + Math.round((index - 1) * 5.6) + rng.int(-2, 2);
    case "inspection":
      return -rng.int(2, 9) - duration;
    case "in_progress":
      return -rng.int(0, Math.max(0, Math.min(duration - 1, 8)));
    case "scheduled":
      return rng.int(3, 30);
    case "planned":
      return rng.int(32, 70);
    case "on_hold":
      return rng.int(-25, 15);
  }
}

function crewOf(rng: Rng, lead: string): string[] {
  const others = TECHNICIANS.filter((id) => id !== lead);
  const crew: string[] = [];
  const size = rng.int(1, 3);
  while (crew.length < size) {
    const member = rng.pick(others);
    if (!crew.includes(member)) crew.push(member);
  }
  return crew;
}

// A won deal's quote is signed the day the deal closed; a direct order a few
// weeks before its start. Work never starts within a week of the signature.
function signatureDays(
  rng: Rng,
  deal: string | undefined,
  start: number,
): { signed: number; start: number } {
  if (!deal) return { signed: Math.min(-1, start - rng.int(18, 40)), start };
  const signed = Math.round(
    (dealFacts(deal).expectedClose.getTime() - Date.now()) / DAY_MS,
  );
  return { signed, start: Math.max(start, signed + 7) };
}

function planProject(rng: Rng, index: number): ProjectPlan {
  const { customer, dealId: deal } = customerOf(rng, index);
  const business = isBusiness(customer);
  const type = typeOf(rng, index, business, deal !== undefined);
  const status = statusOf(index);
  const duration = durationDays(rng, type, business);
  const { signed, start } = signatureDays(
    rng,
    deal,
    startDay(rng, index, status, duration),
  );
  const { lines, capacityKwp } = deal
    ? fitPvLines(rng, business, customer.isVip, dealFacts(deal).amount)
    : buildLines(rng, type, business, customer.isVip);
  const lead = rng.pick(TECHNICIANS);
  return {
    index,
    projectId: projectId(index),
    quoteId: quoteId(index),
    dealId: deal,
    customer,
    type,
    status,
    start: daysFromNow(start, 8),
    end: daysFromNow(start + duration, 17),
    signedAt: deal
      ? dealFacts(deal).expectedClose
      : daysFromNow(signed, rng.int(9, 17)),
    lines,
    capacityKwp,
    vatRate: business ? VAT_BUSINESS : VAT_RESIDENTIAL,
    leadTechnician: lead,
    crew: crewOf(rng, lead),
  };
}

let plans: ProjectPlan[] | undefined;

/** One plan per project, `proj-001` … `proj-080`, oldest first. */
export function projectPlans(): ProjectPlan[] {
  if (!plans) {
    const rng = createRng(0x9e110001);
    plans = Array.from({ length: COUNTS.projects }, (_, at) =>
      planProject(rng, at + 1),
    );
  }
  return plans;
}
