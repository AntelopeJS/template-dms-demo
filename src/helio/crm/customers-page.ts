import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { AfterWrite } from "@antelopejs/interface-dms/base/types/guards";
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
import { type Customer, CustomerModel } from "./database";
import { isValidVatNumber } from "./vat-number";
import {
  CUSTOMER_DELETE_CONFIRM_URL,
  INVOICES_URL,
  PIPELINE_URL,
  PROJECTS_URL,
  QUOTES_URL,
} from "./links";

// A business is invoiced with VAT: the column shows the number, mandatory,
// for a business only (customer-controller.ts), and the write routes refuse
// one that is not valid, whichever client sent it.
function assertVatFormat(vatNumber: unknown): void {
  if (typeof vatNumber !== "string" || vatNumber.trim() === "") return;
  if (!isValidVatNumber(vatNumber)) {
    throw new HTTPResult(400, {
      message: "$helio.crm.customers.errors.vatFormat",
      field: "vatNumber",
    });
  }
}

// The fields only a company fills in (VAT number, website) are hidden for a
// household, and the write routes ignore them there: a business turned
// residential would keep the ones it held, shown on its sheet and found by
// the search. They are cleared once the customer is a household.
const BUSINESS_ONLY_CLEARED = { vatNumber: null, website: null };

const holdsBusinessFields = (customer: Partial<Customer>): boolean =>
  customer.kind !== "business" && !!(customer.vatNumber || customer.website);

async function clearBusinessFields(ids: string[]): Promise<void> {
  const model = GetModel(CustomerModel);
  await Promise.all(ids.map((id) => model.update(id, BUSINESS_ONLY_CLEARED)));
}

function afterWrites(
  ...writes: (AfterWrite | undefined)[]
): AfterWrite | undefined {
  const pending = writes.filter((write) => write !== undefined);
  if (pending.length === 0) return undefined;
  return async () => {
    for (const write of pending) await write();
  };
}

async function refuseActiveCustomers(ids: string[]): Promise<void> {
  const model = GetModel(CustomerModel);
  const customers = await Promise.all(ids.map((id) => model.get(id)));
  if (customers.some((customer) => customer && !customer.isArchived)) {
    throw new HTTPResult(409, {
      message: "$helio.crm.customers.errors.notArchived",
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
    // The generated form pages: the business fields follow the customer
    // type through their columns (visibleWhen).
    formContainer: {
      type: "page",
      pages: {
        new: {
          displayName: "$helio.crm.customers.form.newTitle",
          description: "$helio.crm.customers.form.newDescription",
        },
        edit: { displayName: "$helio.crm.customers.form.editTitle" },
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
      // Only archived customers can be deleted (archive mode): the rule
      // keeps the action off the active ones, on the selection bar too. The
      // dialog, worded by the server, asks to type the customer's name.
      delete: {
        isEnabled: true,
        rule: { field: "isArchived", equals: true },
        confirm: { from: CUSTOMER_DELETE_CONFIRM_URL },
      },
      custom: [
        // The quick view: a right drawer showing the customer's own table
        // form, read-only, for the row clicked (`{{row._id}}`) or the one
        // `?record=<id>` names.
        {
          id: "quick-view",
          label: "$helio.crm.customers.quickView.action",
          icon: "i-ph-sidebar-simple",
          isDefault: true,
          target: {
            type: "drawer",
            direction: "right",
            title: "$helio.crm.customers.quickView.title",
            description: "$helio.crm.customers.quickView.description",
            rowTitle: "{name}",
            positionLabel: "$helio.crm.customers.quickView.position",
            deepLink: true,
            notFound: {
              title: "$helio.crm.customers.quickView.notFoundTitle",
              description: "$helio.crm.customers.quickView.notFoundDescription",
            },
            component: ResourceForm(customerController, {
              mode: "view",
              rowId: "{{row._id}}",
            }),
          },
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
        assertVatFormat(body.vatNumber);
      },
      // An edit only sends what changed: the stored row fills the rest.
      // A new name reaches the deals and quotes that carry it for the search.
      edit: (_ctx, { id, body, current }) => {
        const row = { ...current, ...body };
        assertVatFormat(body.vatNumber);
        const renamed = body.name !== undefined && body.name !== current.name;
        return afterWrites(
          holdsBusinessFields(row)
            ? () => clearBusinessFields([id])
            : undefined,
          renamed ? afterCustomerEdit : undefined,
        );
      },
      // An active customer, or one with deals still in play, is not deleted:
      // the dialog says so (blocked), and a bare API call is refused the same
      // way instead of deleting nothing.
      delete: async (_ctx, { ids }) => {
        await refuseActiveCustomers(ids);
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
 * routes written by hand answer to the permission of the
 * action they stand for.
 */
export function customersTableAction(id: string): Action {
  const action = PageHelioCustomers.table.getAction(id);
  if (!action) throw new Error(`The customers table has no "${id}" action`);
  return action;
}
