import {
  Context,
  Controller,
  type ControllerClass,
  HTTPResult,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Optional,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  type CellSubline,
  Column,
  DefaultDisplays,
  Exported,
  resolveBulkRowIds,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { customerController } from "../crm/controller";
import { mailTicketsResolved } from "../platform/mailing/send";
import { siteController } from "../monitoring/controller";
import { teamController } from "../team/controller";
import { assertCanWriteTickets } from "./access";
import { logTicketsResolved } from "./activity";
import {
  Ticket,
  TicketModel,
  type TicketPriority,
  type TicketStatus,
} from "./database";
import { withTicketNumber } from "./numbering";
import { slaHours } from "./sla";
import {
  SERVICE_TOPIC,
  TICKET_ASSIGNEES,
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "./options";

export * from "./options";

const HOUR_MS = 60 * 60 * 1000;
const CLOSED: readonly string[] = ["resolved", "closed"];

const ASSIGNABLE = new Set(TICKET_ASSIGNEES.map(({ value }) => value));

const day = (date: Date) =>
  ({ type: "date", value: date.toISOString(), format: "day" }) as const;

// Not exported on purpose: emitting a .d.ts for this class would require
// naming types from the nested @antelopejs/interface-core copies (TS2742).
@RegisterDataController()
class ticketDataAPI extends DataController(
  Ticket,
  { ...TableViewRoutes.All, new: withTicketNumber(TableViewRoutes.New) },
  Controller("/api/helio/tickets"),
) {
  @ModelReference()
  @Model(TicketModel)
  declare model: TicketModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.number",
    type: new DefaultDataTypes.StringType({
      placeholder: "$helio.service.tickets.placeholders.number",
      maxLength: 12,
    }),
    filterable: true,
    display: new DefaultDisplays.MonoDisplay(),
    size: 100,
  })
  // Left empty on a new ticket, it takes the next number (see numbering.ts).
  @Mandatory("edit")
  @Access(AccessMode.ReadWrite)
  declare number: string;

  @Searchable()
  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.subject",
    type: new DefaultDataTypes.StringType({
      placeholder: "$helio.service.tickets.placeholders.subject",
      maxLength: 160,
    }),
    filterable: true,
    size: 300,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare subject: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.customer",
    type: new DefaultDataTypes.RelationType({
      dataApiController: customerController,
      keyMapping: { label: "name", value: "_id" },
      placeholder: "$helio.service.tickets.placeholders.customer",
    }),
    filterable: true,
    size: 200,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare customer: string;

  @Listable()
  @Column({
    name: "$helio.service.tickets.columns.site",
    type: new DefaultDataTypes.RelationType({
      dataApiController: siteController,
      keyMapping: { label: "name", value: "_id" },
      placeholder: "$helio.service.tickets.placeholders.site",
      deselectable: true,
    }),
    filterable: true,
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare site: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.category",
    type: new DefaultDataTypes.SelectType({ items: [...TICKET_CATEGORIES] }),
    filterable: true,
    defaultValue: "other",
    size: 170,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare category: string;

  // Writing the priority (always on creation) sets the SLA from the
  // ticket's creation time, which it stamps on a new ticket.
  @Listable(["priority"])
  @Sortable()
  @Exported(["priority"])
  @Column({
    name: "$helio.service.tickets.columns.priority",
    type: new DefaultDataTypes.SelectType({ items: [...TICKET_PRIORITIES] }),
    filterable: true,
    defaultValue: "normal",
    display: new DefaultDisplays.StatusPillDisplay({
      tones: {
        low: "neutral",
        normal: "info",
        high: "warning",
        urgent: "error",
      },
      liveValues: ["urgent"],
    }),
    size: 120,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  get priority(): TicketPriority {
    return this.table.priority;
  }
  set priority(value: TicketPriority) {
    this.table.priority = value;
    this.table.createdAt ??= new Date();
    const hours = slaHours(value);
    this.table.slaDueAt = new Date(
      new Date(this.table.createdAt).getTime() + hours * HOUR_MS,
    );
  }

  // Resolving or closing a ticket stamps when; reopening it clears it.
  @Listable(["status"])
  @Sortable()
  @Exported(["status"])
  @Column({
    name: "$helio.service.tickets.columns.status",
    type: new DefaultDataTypes.SelectType({ items: [...TICKET_STATUSES] }),
    filterable: true,
    defaultValue: "new",
    display: new DefaultDisplays.StatusPillDisplay({
      tones: {
        new: "info",
        open: "primary",
        waiting: "warning",
        resolved: "success",
        closed: "neutral",
      },
      subField: "statusDetail",
      subTone: "muted",
      liveValues: ["new"],
    }),
    size: 170,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  get status(): TicketStatus {
    return this.table.status;
  }
  set status(value: TicketStatus) {
    this.table.status = value;
    if (!CLOSED.includes(value)) this.table.resolvedAt = undefined;
    else this.table.resolvedAt ??= new Date();
  }

  @Listable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.channel",
    type: new DefaultDataTypes.SelectType({ items: [...TICKET_CHANNELS] }),
    filterable: true,
    defaultValue: "phone",
    isVisible: false,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare channel: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.assignee",
    type: new DefaultDataTypes.RelationType({
      dataApiController: teamController,
      keyMapping: { label: "name", value: "_id", avatar: "avatar" },
      placeholder: "$helio.service.tickets.placeholders.assignee",
      deselectable: true,
    }),
    filterable: true,
    size: 180,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare assignee: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.slaDueAt",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({
      soonWithinMs: 4 * HOUR_MS,
      soonTone: "warning",
    }),
    size: 130,
  })
  @Access(AccessMode.ReadOnly)
  declare slaDueAt: Date;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.createdAt",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({
      nowWithinMs: 10 * 60 * 1000,
      nowLabel: "$helio.service.tickets.justNow",
    }),
    size: 130,
  })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.service.tickets.columns.resolvedAt",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({ style: "day" }),
    isVisible: false,
  })
  @Access(AccessMode.ReadOnly)
  declare resolvedAt: Date;

  @Column({
    name: "$helio.service.tickets.columns.description",
    type: new DefaultDataTypes.StringType({
      textarea: true,
      rows: 5,
      placeholder: "$helio.service.tickets.placeholders.description",
    }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare description: string;

  @Listable()
  @Column({
    name: "$helio.service.tickets.columns.pinned",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
    defaultValue: false,
    display: new DefaultDisplays.IndicatorDisplay({
      onIcon: "i-ph-push-pin-fill",
      onTone: "primary",
    }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare pinned: boolean;

  // Under the status: an open ticket past its SLA (the promised resolution
  // time) in red, else when a resolved one was resolved.
  @Listable(["status", "slaDueAt", "resolvedAt"])
  @Access(AccessMode.ReadOnly)
  get statusDetail(): CellSubline | null {
    const { status, slaDueAt, resolvedAt } = this.table;
    if (CLOSED.includes(status)) {
      return resolvedAt
        ? {
            text: {
              key: "$helio.service.tickets.detail.resolved",
              params: { date: day(resolvedAt) },
            },
          }
        : null;
    }
    if (slaDueAt && new Date(slaDueAt).getTime() < Date.now()) {
      return {
        text: "$helio.service.tickets.detail.slaBreached",
        tone: "error",
      };
    }
    return null;
  }

  // "Assign to…" on the selection bar: the selected tickets, or every ticket
  // the filters match, go to the person picked in the confirmation. A new
  // ticket someone took is open from then on.
  @Post("bulk/assign")
  async bulkAssign(
    @Context() ctx: RequestContext,
    @AuthUser() user: User,
    @JSONBody() body: { assignee?: string },
  ): Promise<{ count: number }> {
    await assertCanWriteTickets(ctx, user);
    const assignee = body?.assignee;
    if (!assignee || !ASSIGNABLE.has(assignee)) {
      throw new HTTPResult(400, {
        message: "$helio.service.bulk.assign.invalid",
        field: "assignee",
      });
    }
    const ids = await resolveBulkRowIds(this, ctx, user);
    const tickets = await this.loadTickets(ids);
    await Promise.all(
      tickets.map((ticket) =>
        this.model.update(ticket._id, {
          assignee,
          status: ticket.status === "new" ? "open" : ticket.status,
        }),
      ),
    );
    return this.published(tickets.map(({ _id }) => _id));
  }

  // "Resolve" on the selection bar: the tickets still open are resolved now;
  // resolved and closed ones are left as they are.
  @Post("bulk/resolve")
  async bulkResolve(
    @Context() ctx: RequestContext,
    @AuthUser() user: User,
  ): Promise<{ count: number }> {
    await assertCanWriteTickets(ctx, user);
    const ids = await resolveBulkRowIds(this, ctx, user);
    const open = (await this.loadTickets(ids)).filter(
      ({ status }) => !CLOSED.includes(status),
    );
    const resolvedAt = new Date();
    await Promise.all(
      open.map(({ _id }) =>
        this.model.update(_id, { status: "resolved", resolvedAt }),
      ),
    );
    // Helio platform (mailing): each customer is told, in the background.
    void mailTicketsResolved(open.map(({ _id }) => _id));
    await logTicketsResolved(open);
    return this.published(open.map(({ _id }) => _id));
  }

  // A selection-bar run also sends the row token of the actions, unresolved
  // or empty: an id naming no ticket is skipped.
  private async loadTickets(ids: string[]): Promise<Ticket[]> {
    const rows = await Promise.all(
      ids.filter(Boolean).map((id) => this.model.get(id)),
    );
    return rows.filter((row): row is Ticket => row !== undefined);
  }

  // Written through the model, which the table's own realtime does not see:
  // the desk's table and stats follow the topic instead.
  private async published(ids: string[]): Promise<{ count: number }> {
    if (ids.length > 0) {
      await PublishMessage(SERVICE_TOPIC, "tickets.updated", {
        payload: { ids },
      });
    }
    return { count: ids.length };
  }
}

// ControllerClass-typed alias for relations and pages (see the TS2742 note).
export const ticketController: ControllerClass = ticketDataAPI;
