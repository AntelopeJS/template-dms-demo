import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  ResourceForm,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { helioSalesCategory } from "../category";
import { dealController } from "./deal-controller";
import { afterDealEdit, afterDealWrite } from "./deal-derived";
import { CUSTOMER_QUICK_VIEW_URL } from "./links";
import { PIPELINE_VIEWS } from "./pipeline-views";

// Deals still in play, for the footer figures: a summary rule reads stored
// fields, so it names the closed stages rather than the computed isOpen.
const OPEN_DEAL = { field: "stage", notIn: ["won", "lost"] };

@RegisterPage()
export class PageHelioPipeline extends PageController(
  "pipeline",
  {
    displayName: "$helio.crm.pipeline.nav",
    description: "$helio.crm.pipeline.description",
    icon: "i-ph-kanban",
    category: helioSalesCategory,
    order: 0,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(dealController, {
    caption: "$helio.crm.pipeline.caption",
    labelKey: "title",
    searchPlaceholder: "$helio.crm.pipeline.search",
    // The board first: one column per stage, a card moved to another column
    // changes the deal's stage. The grid stays one click away.
    kanban: { groupByField: "stage", draggable: true, columnMaxHeight: "68vh" },
    displays: [{ id: "kanban" }, { id: "table" }],
    defaultDisplay: "kanban",
    card: { fields: ["customer", "amount", "expectedClose", "owner"] },
    defaultSort: { field: "expectedClose" },
    pageSize: 25,
    quickFilters: [
      { field: "owner", label: "$helio.crm.pipeline.quickFilters.owner" },
      { field: "source", label: "$helio.crm.pipeline.quickFilters.source" },
    ],
    // "Deals" of a customer (customers page): ?customer=<id>, as a chip.
    queryParamFilters: {
      customer: {
        field: "customer",
        visible: true,
        label: "$helio.crm.pipeline.customerChip",
      },
    },
    views: PIPELINE_VIEWS,
    footer: {
      countLabel: "$helio.crm.pipeline.count",
      summary: [
        {
          label: "$helio.crm.pipeline.summary.open",
          field: "amount",
          op: "sum",
          where: OPEN_DEAL,
        },
        {
          label: "$helio.crm.pipeline.summary.weighted",
          field: "weightedAmount",
          op: "sum",
          where: OPEN_DEAL,
        },
        {
          label: "$helio.crm.pipeline.summary.won",
          field: "amount",
          op: "sum",
          where: { field: "stage", equals: "won" },
        },
      ],
      legend: "stage",
    },
    emptyStates: {
      firstRun: {
        title: "$helio.crm.pipeline.empty.firstRunTitle",
        description: "$helio.crm.pipeline.empty.firstRunDescription",
        icon: "i-ph-kanban",
      },
      filtered: {
        title: "$helio.crm.pipeline.empty.filteredTitle",
        description: "$helio.crm.pipeline.empty.filteredDescription",
      },
    },
    formContainer: {
      type: "drawer",
      pages: {
        new: {
          displayName: "$helio.crm.pipeline.form.newTitle",
          description: "$helio.crm.pipeline.form.newDescription",
        },
        edit: { displayName: "$helio.crm.pipeline.form.editTitle" },
        details: { displayName: "$helio.crm.pipeline.form.detailsTitle" },
      },
    },
    rowActions: {
      add: {
        isEnabled: true,
        label: "$helio.crm.pipeline.newDeal",
        icon: "i-ph-plus",
      },
      edit: true,
      duplicate: true,
      copyLink: true,
      hasSelection: true,
      menuLabel: "$helio.crm.pipeline.menuLabel",
      delete: {
        isEnabled: true,
        successMessage: "$helio.crm.pipeline.deleted",
        confirm: {
          title: "$helio.crm.pipeline.deleteConfirm.title",
          description: "$helio.crm.pipeline.deleteConfirm.description",
          icon: "i-ph-trash",
          color: "error",
          confirmLabel: "$helio.crm.pipeline.deleteConfirm.confirm",
        },
      },
      custom: [
        // `?record=<deal id>` (the dashboard's activity feed, a customer's
        // deals) opens the deal read-only in a right drawer. Its form reads
        // the row from the URL, so the drawer is only opened from it: a rule
        // no row meets keeps it out of the menus, a click edits the deal.
        {
          id: "quick-view",
          label: "$helio.crm.pipeline.quickView.action",
          icon: "i-ph-sidebar-simple",
          deepLink: true,
          rule: { field: "_id", in: [] },
          target: {
            type: "drawer",
            direction: "right",
            title: "$helio.crm.pipeline.quickView.title",
            description: "$helio.crm.pipeline.quickView.description",
            component: ResourceForm(dealController, {
              mode: "view",
              rowId: "{{query.record}}",
            }),
          },
        },
        {
          id: "customer",
          label: "$helio.crm.pipeline.actions.customer",
          icon: "i-ph-address-book",
          target: { type: "page", url: CUSTOMER_QUICK_VIEW_URL },
        },
      ],
    },
    // The stored derived fields follow each write (see deal-derived.ts).
    guards: {
      new: afterDealWrite,
      edit: (_ctx, { id, body, current }) =>
        afterDealEdit(id, body.stage, current.stage),
    },
  });
}
