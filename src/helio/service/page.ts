import { Get } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { LiveToggle } from "@antelopejs/interface-dms/base/live-toggle";
import { StatGroup } from "@antelopejs/interface-dms/base/stat-group";
import {
  TableView,
  tableViewLink,
} from "@antelopejs/interface-dms/base/table-view";
import {
  PageController,
  RegisterPage,
  pageRoutePath,
} from "@antelopejs/interface-dms/page";
import { QuickAction } from "@antelopejs/interface-dms/quick-actions";
import { helioOperationsCategory } from "../category";
import { helioQuickActions } from "../shared/quick-actions";
import { assertCanRun, setTicketWriteAction } from "./access";
import { logTicketReopened, logTicketResolved } from "./activity";
import { ticketController } from "./controller";
import { TicketModel } from "./database";
import { SERVICE_DESK_PATH, SERVICE_TOPIC } from "./options";
import { assertSiteOfCustomer } from "./site-rule";
import { refreshSlaHours, slaHours } from "./sla";
import { serviceStats } from "./stats";
import {
  ticketFooter,
  ticketRowActions,
  ticketTabs,
  ticketViews,
} from "./table-options";

const route = (path: string) => pageRoutePath(SERVICE_DESK_PATH, path);

const isClosing = (status: string | undefined): boolean =>
  status === "resolved" || status === "closed";

// The after-sales desk: the tickets as they arrive (a live page, the
// simulator writing one every few minutes during office hours), opened in a
// drawer with a click, triaged with saved views, quick filters and bulk
// actions.
@RegisterPage()
export class PageHelioService extends PageController(
  "service",
  {
    displayName: "$helio.service.page.name",
    description: "$helio.service.page.description",
    icon: "i-ph-lifebuoy",
    category: helioOperationsCategory,
    order: 1,
    live: { maxRate: 3 },
  },
  DefaultLayout({ fullWidth: true }),
) {
  static live = LiveToggle({
    variant: "pill",
    align: "right",
    missedLabel: "$helio.service.live.missed",
  });

  static stats = StatGroup({
    layout: "cards",
    columns: 4,
    label: "$helio.service.stats.label",
    fetchUrl: route("/stats"),
    realtimeTopic: SERVICE_TOPIC,
    skeletonCount: 4,
  });

  static table = TableView(ticketController, {
    caption: "$helio.service.table.caption",
    labelKey: "number",
    searchPlaceholder: "$helio.service.table.search",
    rowClick: "single",
    pageSize: 25,
    density: "compact",
    defaultSort: { field: "createdAt", desc: true },
    pinnedRows: { field: "pinned", equals: true },
    realtimeTopic: SERVICE_TOPIC,
    liveHold: {
      whileSearching: true,
      missedLabel: "$helio.service.live.newTickets",
    },
    // `?ticket=T-1042` opens the desk on one ticket (the urgent-ticket
    // notification links there), shown as a removable chip.
    queryParamFilters: {
      ticket: {
        field: "number",
        mode: "is",
        visible: true,
        label: "$helio.service.table.filters.ticket",
      },
    },
    quickFilters: [
      { field: "assignee", label: "$helio.service.table.filters.assignee" },
      { field: "priority", label: "$helio.service.table.filters.priority" },
      { field: "category", label: "$helio.service.table.filters.category" },
    ],
    views: ticketViews,
    tabs: ticketTabs,
    footer: ticketFooter,
    expandable: {
      fields: ["description", "site", "channel"],
      fieldsLabel: "$helio.service.table.expandLabel",
      single: true,
    },
    emptyStates: {
      firstRun: {
        title: "$helio.service.table.empty.firstRunTitle",
        description: "$helio.service.table.empty.firstRunDescription",
        icon: "i-ph-lifebuoy",
      },
      filtered: {
        title: "$helio.service.table.empty.filteredTitle",
        description: "$helio.service.table.empty.filteredDescription",
        icon: "i-ph-check-circle",
      },
    },
    formContainer: {
      type: "drawer",
      pages: {
        new: {
          displayName: "$helio.service.form.newTitle",
          description: "$helio.service.form.newDescription",
        },
        edit: { displayName: "$helio.service.form.editTitle" },
        details: { displayName: "$helio.service.form.detailsTitle" },
      },
    },
    rowActions: ticketRowActions,
    // A ticket resolved, closed or reopened from its form reaches the
    // activity feed, as the "Resolve" and "Reopen" actions do.
    // Every write first reads the service levels of the Settings page, which
    // the priority sets the SLA from.
    guards: {
      new: async (_ctx, { body }) => {
        await refreshSlaHours();
        await assertSiteOfCustomer(body.customer, body.site);
      },
      edit: async (_ctx, { id, body, current }) => {
        await refreshSlaHours();
        if (body.customer !== undefined || body.site !== undefined) {
          await assertSiteOfCustomer(
            body.customer ?? current.customer,
            body.site === undefined ? current.site : body.site,
          );
        }
        if (body.status === undefined) return undefined;
        if (isClosing(body.status) && !isClosing(current.status))
          return () => logTicketResolved(id);
        if (!isClosing(body.status) && isClosing(current.status))
          return () => logTicketReopened(id);
        return undefined;
      },
    },
  });

  @Get("stats")
  async stats() {
    const tickets = await GetModel(TicketModel).getAll();
    await refreshSlaHours();
    const link = (view: string) =>
      tableViewLink(PageHelioService, "table", { view });
    return {
      items: serviceStats(
        tickets,
        {
          open: link("open"),
          urgent: link("urgent"),
          breaching: link("breaching"),
          resolved: tableViewLink(PageHelioService, "table", {
            tab: "resolved",
          }),
        },
        slaHours("urgent"),
      ),
    };
  }
}

// The bulk routes check the table's own edit permission (see access.ts).
setTicketWriteAction(PageHelioService.table.getAction("edit"));

// The menu badge counts every ticket still open — new, open or waiting for
// the customer: nobody resolved it yet — the same set as the "Open tickets"
// figure above the desk, the "Open" view and the team page. One count rather
// than one badge per status tab, whose counts the menu adds up: read side by
// side they could disagree. Drawn in warning while new tickets wait for
// someone to look at them.
const listTickets = PageHelioService.table.getAction("list");
PageHelioService.table.navBadge({
  count: async (ctx, user) => {
    await assertCanRun(listTickets, ctx, user);
    const open = (await GetModel(TicketModel).getAll()).filter(
      (ticket) => !ticket.resolvedAt,
    );
    const fresh = open.some((ticket) => ticket.status === "new");
    return { count: open.length, tone: fresh ? "warning" : "info" };
  },
});

QuickAction("helio-new-ticket", {
  category: helioQuickActions,
  displayName: "$helio.service.quickActions.newTicket",
  icon: "i-ph-lifebuoy",
  target: {
    type: "openForm",
    page: PageHelioService,
    component: PageHelioService.table,
  },
});
