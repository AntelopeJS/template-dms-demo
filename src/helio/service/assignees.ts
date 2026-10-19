// Who may hold a ticket: the technicians, and the office for the billing
// questions — never the manager or the sales reps. The ticket's assignee
// column picks from this controller rather than the whole team, and the bulk
// "Assign to…" action reads the same team rows (ticketHolders), so the form
// picker, the desk's quick filter and the action offer the same people,
// newcomers included.

import {
  Controller,
  type ControllerClass,
  type RequestContext,
} from "@antelopejs/interface-api";
import {
  type DataControllerCallback,
  type DataControllerCallbackWithOptions,
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { GetModel, Model } from "@antelopejs/interface-database-decorators";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import {
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import type { TeamRole } from "../shared/roster";
import { TeamMember, TeamMemberModel } from "../team/database";
import { TicketModel } from "./database";
import { SERVICE_TOPIC } from "./options";

/** The roles a ticket can be assigned to. */
export const TICKET_HOLDER_ROLES: ReadonlySet<TeamRole> = new Set([
  "technician",
  "office",
]);

/** The team members who may hold a ticket, by name. */
export async function ticketHolders(): Promise<TeamMember[]> {
  const members = await GetModel(TeamMemberModel).getAll();
  return members
    .filter((member) => TICKET_HOLDER_ROLES.has(member.role))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Whether `id` names a team member who may hold a ticket. */
export async function isTicketHolder(id: string | undefined): Promise<boolean> {
  if (!id) return false;
  const member = await GetModel(TeamMemberModel).get(id);
  return member !== undefined && TICKET_HOLDER_ROLES.has(member.role);
}

/**
 * Hands the open tickets of members leaving the team back to nobody: they
 * show in the desk's "Unassigned" view and every unassigned count, ready
 * for a new holder. Resolved and closed tickets keep who held them.
 */
export async function releaseOpenTickets(memberIds: string[]): Promise<void> {
  const leaving = new Set(memberIds);
  const model = GetModel(TicketModel);
  const held = (await model.getAll()).filter(
    (ticket) =>
      !ticket.resolvedAt && ticket.assignee && leaving.has(ticket.assignee),
  );
  await Promise.all(
    held.map(({ _id }) =>
      // null clears the stored holder (undefined would leave it in place).
      model.update(_id, { assignee: null as unknown as undefined }),
    ),
  );
  if (held.length > 0) {
    await PublishMessage(SERVICE_TOPIC, "tickets.updated", {
      payload: { ids: held.map(({ _id }) => _id) },
    });
  }
}

interface SelectPage {
  results?: Array<Record<string, unknown>>;
  total?: number;
}

// The team's select route, keeping the people who may hold a ticket. The
// data API has no "one of" route filter, so the rows are kept after the read:
// the whole team (a dozen people) is read in one page, whatever page size
// the picker asks for, and the total is the kept count.
const WHOLE_TEAM = 200;

function holdersOnly(
  route: DataControllerCallbackWithOptions,
): DataControllerCallbackWithOptions {
  const callback: DataControllerCallback = route.callback;
  return {
    ...route,
    callback: {
      ...callback,
      func: async function (
        this: unknown,
        ctx: RequestContext,
        params: { limit?: number; offset?: number } | undefined,
        ...rest: unknown[]
      ) {
        const read = callback.func as (...args: unknown[]) => unknown;
        const page = (await read.call(
          this,
          ctx,
          { ...params, limit: WHOLE_TEAM, offset: 0 },
          ...rest,
        )) as SelectPage | undefined;
        if (!page?.results) return page;
        const results = page.results.filter((row) =>
          TICKET_HOLDER_ROLES.has(row.role as TeamRole),
        );
        return { ...page, results, total: results.length };
      },
    },
  };
}

// Not exported on purpose (see the TS2742 note of the other controllers).
@RegisterDataController()
class ticketAssigneeDataAPI extends DataController(
  TeamMember,
  {
    get: TableViewRoutes.Get,
    select: holdersOnly(TableViewRoutes.Select),
  },
  Controller("/api/helio/ticket-assignees"),
) {
  @ModelReference()
  @Model(TeamMemberModel)
  declare model: TeamMemberModel;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  declare name: string;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare avatar: string;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare role: string;
}

export const ticketAssigneeController: ControllerClass = ticketAssigneeDataAPI;
