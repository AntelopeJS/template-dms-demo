import { HTTPResult } from "@antelopejs/interface-api";
import type { Action } from "@antelopejs/interface-dms/component";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  ResourceForm,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { QuickAction } from "@antelopejs/interface-dms/quick-actions";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { helioSalesCategory } from "../category";
import { helioQuickActions } from "../shared/quick-actions";
import { CUSTOMER_KINDS, customerController } from "./customer-controller";
import { countCustomerDeals } from "./customer-deals";
import { afterCustomerEdit } from "./customer-names";
import { isValidVatNumber } from "./vat-number";
import {
  CUSTOMER_DELETE_CONFIRM_URL,
  CUSTOMER_RECORD_URL,
  INVOICES_URL,
  PIPELINE_URL,
  PROJECTS_URL,
  QUOTES_URL,
} from "./links";

// A business is invoiced with VAT: the form asks for the number (see the
// watches of customer-form-pages.ts), and the write routes refuse a business
// without a valid one, whichever client sent it.
function assertBusinessVat(kind: unknown, vatNumber: unknown): void {
  if (kind !== "business") return;
  if (typeof vatNumber !== "string" || vatNumber.trim() === "") {
    throw new HTTPResult(400, {
      message: "$helio.crm.customers.errors.vatRequired",
      field: "vatNumber",
    });
  }
  if (!isValidVatNumber(vatNumber)) {
    throw new HTTPResult(400, {
      message: "$helio.crm.customers.errors.vatFormat",
      field: "vatNumber",
    });
  }
}

@RegisterPage()
export class PageHelioCustomers extends PageController(
  "customers",
  {
    displayName: "$helio.crm.customers.nav",
    description: "$helio.crm.customers.description",
    icon: "i-ph-address-book",
    category: helioSalesCategory,
    order: 2,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(customerController, {
    caption: "$helio.crm.customers.caption",
    labelKey: "name",
    searchPlaceholder: "$helio.crm.customers.search",
    archiveMode: true,
    // VIP accounts stay on top of their page, whatever the sort.
    pinnedRows: { field: "isVip", equals: true },
    defaultSort: { field: "name" },
    pageSize: 25,
    rowClick: "single",
    quickFilters: [
      { field: "owner", label: "$helio.crm.customers.quickFilters.owner" },
      { field: "source", label: "$helio.crm.customers.quickFilters.source" },
    ],
    tabs: CUSTOMER_KINDS.map((kind) => ({
      id: kind.value,
      label: kind.label,
      icon: kind.icon,
      iconColor: kind.iconColor,
      textColor: kind.textColor,
      filter: { accessorKey: "kind", value: kind.value, mode: "is" },
    })),
    // Links from the dashboard and the segment chips: ?segment=batterie.
    queryParamFilters: {
      segment: {
        field: "segments",
        mode: "include",
        visible: true,
        label: "$helio.crm.customers.segmentChip",
      },
    },
    footer: {
      countLabel: "$helio.crm.customers.count",
      summary: [
        {
          label: "$helio.crm.customers.summary.vip",
          op: "count",
          where: { field: "isVip", equals: true },
        },
        {
          label: "$helio.crm.customers.summary.business",
          op: "count",
          where: { field: "kind", equals: "business" },
        },
      ],
      legend: "kind",
    },
    emptyStates: {
      firstRun: {
        title: "$helio.crm.customers.empty.firstRunTitle",
        description: "$helio.crm.customers.empty.firstRunDescription",
        icon: "i-ph-address-book",
      },
      filtered: {
        title: "$helio.crm.customers.empty.filteredTitle",
        description: "$helio.crm.customers.empty.filteredDescription",
      },
    },
    // Page forms, written by hand (customer-form-pages.ts): a generated form
    // takes no watch, and the VAT field follows the customer type.
    formContainer: {
      type: "page",
      pages: {
        new: {
          displayName: "$helio.crm.customers.form.newTitle",
          description: "$helio.crm.customers.form.newDescription",
          customPage: true,
        },
        edit: {
          displayName: "$helio.crm.customers.form.editTitle",
          customPage: true,
        },
        details: { displayName: "$helio.crm.customers.form.detailsTitle" },
      },
    },
    rowActions: {
      add: {
        isEnabled: true,
        label: "$helio.crm.customers.newCustomer",
        icon: "i-ph-plus",
      },
      edit: true,
      copyLink: true,
      hasSelection: true,
      menuLabel: "$helio.crm.customers.menuLabel",
      archive: {
        isEnabled: true,
        successMessage: "$helio.crm.customers.archived",
      },
      restore: {
        isEnabled: true,
        successMessage: "$helio.crm.customers.restored",
      },
      // Only archived customers can be deleted (archive mode); the dialog,
      // worded by the server, asks to type the customer's name.
      delete: {
        isEnabled: true,
        confirm: { from: CUSTOMER_DELETE_CONFIRM_URL },
      },
      custom: [
        // The quick view: a right drawer showing the customer's own table
        // form, read-only. Its form reads the row from ?record=, which the
        // drawer writes only after it mounted: opened from a click, the form
        // would find no row. So the drawer is only ever opened from the URL
        // (this deep-linked action, kept out of the menus by a rule no row
        // meets), and the click goes through the URL (the next action).
        {
          id: "quick-view-drawer",
          label: "$helio.crm.customers.quickView.action",
          icon: "i-ph-sidebar-simple",
          deepLink: true,
          rule: { field: "_id", in: [] },
          target: {
            type: "drawer",
            direction: "right",
            title: "$helio.crm.customers.quickView.title",
            description: "$helio.crm.customers.quickView.description",
            component: ResourceForm(customerController, {
              mode: "view",
              rowId: "{{query.record}}",
            }),
          },
        },
        {
          id: "quick-view",
          label: "$helio.crm.customers.quickView.action",
          icon: "i-ph-sidebar-simple",
          isDefault: true,
          target: { type: "page", url: CUSTOMER_RECORD_URL },
        },
        {
          id: "deals",
          label: "$helio.crm.customers.actions.deals",
          icon: "i-ph-kanban",
          target: { type: "page", url: `${PIPELINE_URL}?customer={{row._id}}` },
        },
        {
          id: "quotes",
          label: "$helio.crm.customers.actions.quotes",
          icon: "i-ph-file-text",
          target: { type: "page", url: `${QUOTES_URL}?customer={{row._id}}` },
        },
        {
          id: "projects",
          label: "$helio.crm.customers.actions.projects",
          icon: "i-ph-hard-hat",
          target: {
            type: "page",
            url: `${PROJECTS_URL}?customer={{row._id}}&table.view=all`,
          },
        },
        {
          id: "invoices",
          label: "$helio.crm.customers.actions.invoices",
          icon: "i-ph-receipt",
          // Every status of the customer's invoices, whatever tab was left open.
          target: {
            type: "page",
            url: `${INVOICES_URL}?customer={{row._id}}&table.tab=all`,
          },
        },
        {
          id: "email",
          label: "$helio.crm.customers.actions.email",
          icon: "i-ph-envelope-simple",
          target: { type: "external", url: "mailto:{{row.email}}" },
        },
      ],
    },
    guards: {
      new: (_ctx, { body }) => {
        assertBusinessVat(body.kind, body.vatNumber);
      },
      // An edit only sends what changed: the stored row fills the rest.
      // A new name reaches the deals and quotes that carry it for the search.
      edit: (_ctx, { body, current }) => {
        const row = { ...current, ...body };
        assertBusinessVat(row.kind, row.vatNumber);
        if (body.name !== undefined && body.name !== current.name) {
          return afterCustomerEdit;
        }
        return undefined;
      },
      // A customer with deals still in play is not deleted: the dialog says
      // so (blocked), and a bare API call is refused the same way.
      delete: async (_ctx, { ids }) => {
        const { open } = await countCustomerDeals(ids);
        if (open > 0) {
          throw new HTTPResult(409, {
            message: "$helio.crm.customers.errors.openDeals",
          });
        }
      },
    },
  });
}

QuickAction("helio-new-customer", {
  category: helioQuickActions,
  displayName: "$helio.crm.customers.quickAction",
  icon: "i-ph-user-plus",
  target: {
    type: "openForm",
    page: PageHelioCustomers,
    component: PageHelioCustomers.table,
  },
});

/**
 * One of the customers table's own actions (`add`, `edit`, `delete`…): the
 * form pages and routes written by hand answer to the permission of the
 * action they stand for.
 */
export function customersTableAction(id: string): Action {
  const action = PageHelioCustomers.table.getAction(id);
  if (!action) throw new Error(`The customers table has no "${id}" action`);
  return action;
}
