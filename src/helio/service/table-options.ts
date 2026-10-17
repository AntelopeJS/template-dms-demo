// The desk table's views, tabs, footer and row actions, kept out of the page
// file so the page reads as its blocks.

import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  type TableViewFooterOptions,
  type TableViewRowActionOptions,
  type TableViewTab,
  type TableViewViewsOptions,
} from "@antelopejs/interface-dms/base/table-view";
import type { CustomRowAction } from "@antelopejs/interface-dms/base/types/row-action";
import { TICKET_ASSIGNEES, TICKET_STATUSES } from "./options";

const TICKETS_API = "/api/helio/tickets";

// A ticket is still open while nobody resolved it: `resolvedAt` is stamped
// exactly when it is resolved or closed, and a select column cannot filter on
// "one of new, open, waiting" in one filter.
const STILL_OPEN = {
  accessorKey: "resolvedAt",
  mode: "is_empty",
} as const;

export const ticketViews: TableViewViewsOptions = {
  layout: "strip",
  defaultView: "all",
  userViews: true,
  items: [
    { id: "all", label: "$helio.service.views.all", icon: "i-ph-tray" },
    {
      id: "open",
      label: "$helio.service.views.open",
      icon: "i-ph-wrench",
      count: true,
      filters: [STILL_OPEN],
    },
    {
      id: "urgent",
      label: "$helio.service.views.urgent",
      icon: "i-ph-fire",
      tone: "error",
      count: true,
      filters: [
        STILL_OPEN,
        { accessorKey: "priority", mode: "is", value: "urgent" },
      ],
      sort: [{ field: "slaDueAt" }],
    },
    {
      id: "unassigned",
      label: "$helio.service.views.unassigned",
      icon: "i-ph-user-circle-dashed",
      tone: "warning",
      count: true,
      filters: [STILL_OPEN, { accessorKey: "assignee", mode: "is_empty" }],
      sort: [{ field: "slaDueAt" }],
    },
    {
      id: "waiting",
      label: "$helio.service.views.waiting",
      icon: "i-ph-hourglass-medium",
      count: true,
      filters: [{ accessorKey: "status", mode: "is", value: "waiting" }],
    },
    {
      id: "breaching",
      label: "$helio.service.views.breaching",
      icon: "i-ph-alarm",
      tone: "error",
      count: true,
      // Nobody took it in hand within the promised time.
      filters: [
        STILL_OPEN,
        { accessorKey: "assignee", mode: "is_empty" },
        { accessorKey: "slaDueAt", mode: "less_than", value: "{{now}}" },
      ],
      sort: [{ field: "slaDueAt" }],
    },
  ],
};

// The new and open tickets count on the menu entry, in the tone of the new
// ones: they still wait for someone to look at them.
const NAV_BADGES: Record<string, TableViewTab["navBadge"]> = {
  new: { tone: "warning" },
  open: { tone: "info" },
};

// One tab per status.
export const ticketTabs: TableViewTab[] = TICKET_STATUSES.map((status) => ({
  id: status.value,
  label: status.label,
  icon: status.icon,
  iconColor: status.iconColor,
  textColor: status.textColor,
  filter: { accessorKey: "status", value: status.value, mode: "is" },
  navBadge: NAV_BADGES[status.value],
}));

export const ticketFooter: TableViewFooterOptions = {
  countLabel: "$helio.service.table.count",
  summary: [
    {
      label: "$helio.service.table.footer.urgent",
      op: "count",
      where: {
        and: [
          { field: "priority", equals: "urgent" },
          { field: "status", notIn: ["resolved", "closed"] },
        ],
      },
    },
    {
      label: "$helio.service.table.footer.waiting",
      op: "count",
      where: { field: "status", equals: "waiting" },
    },
  ],
  legend: "status",
};

// The bulk routes take the selection as `?ids=`. On a single row the
// selection bar's query is missing, so the row's own id is named; on the bar
// that token reaches the route unresolved, and the route skips any id that
// names no ticket.
const BULK_ROW_IDS = "?ids={{row._id}}";

const assignAction: CustomRowAction = {
  label: "$helio.service.actions.assign",
  icon: "i-ph-user-switch",
  permission: "edit",
  bulk: { allMatching: true },
  confirm: {
    title: "$helio.service.bulk.assign.title",
    description: "$helio.service.bulk.assign.description",
    icon: "i-ph-user-switch",
    color: "primary",
    confirmLabel: "$helio.service.bulk.assign.confirm",
    fields: [
      {
        id: "assignee",
        label: "$helio.service.bulk.assign.field",
        type: new DefaultDataTypes.SelectType({
          items: TICKET_ASSIGNEES,
          placeholder: "$helio.service.bulk.assign.placeholder",
        }),
        required: true,
      },
    ],
  },
  target: {
    type: "api",
    url: `${TICKETS_API}/bulk/assign${BULK_ROW_IDS}`,
    method: "POST",
    successMessage: "$helio.service.bulk.assign.done",
  },
};

const resolveAction: CustomRowAction = {
  label: "$helio.service.actions.resolve",
  icon: "i-ph-check-circle",
  color: "success",
  permission: "edit",
  bulk: { allMatching: true },
  rule: { field: "status", notIn: ["resolved", "closed"] },
  confirm: {
    title: "$helio.service.bulk.resolve.title",
    description: "$helio.service.bulk.resolve.description",
    icon: "i-ph-check-circle",
    color: "success",
    confirmLabel: "$helio.service.bulk.resolve.confirm",
  },
  target: {
    type: "api",
    url: `${TICKETS_API}/bulk/resolve${BULK_ROW_IDS}`,
    method: "POST",
    successMessage: "$helio.service.bulk.resolve.done",
  },
};

// A click on a ticket opens its edit form (rowClick "single" on the page).
// The row side panel was tried first: with a ResourceForm reading
// `{{query.record}}` it shows the right ticket only when the page is loaded
// on `?record=`; a click or J / K writes the URL in place, which the form's
// route values do not follow, so it kept showing the previous ticket.
export const ticketRowActions: TableViewRowActionOptions = {
  add: true,
  edit: true,
  details: true,
  duplicate: false,
  delete: false,
  hasSelection: true,
  custom: [assignAction, resolveAction],
};
