import {
  type FormBuilder,
  FormEvents,
  FormFunctions,
} from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  ResourceForm,
  ROUTE_PARAM_ROW_ID,
  TableViewFunctions,
} from "@antelopejs/interface-dms/base/table-view";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { customerController, type CUSTOMER_KINDS } from "./customer-controller";
import { customersTableAction, PageHelioCustomers } from "./customers-page";
import { CUSTOMERS_URL } from "./links";

// The customers table opens these pages for its add and edit actions
// (`formContainer.pages.*.customPage`): the forms the table generates take no
// watch, and these follow the customer type. Their slugs are the table's
// default form URLs, under the customers page.

type CustomerKind = (typeof CUSTOMER_KINDS)[number]["value"];

// Fields only a company fills in: shown, and the VAT number required, for a
// business; hidden for a household. FIELD_CHANGE also fires once with the
// value the form starts from, so an opened form is right before any change.
const BUSINESS_FIELDS = [
  { field: "vatNumber", required: true },
  { field: "website", required: false },
] as const;

function onKind(kind: CustomerKind) {
  return [
    { key: "fieldId", value: "kind" },
    { key: "value", value: kind },
  ];
}

function withBusinessFields(form: FormBuilder): FormBuilder {
  for (const { field, required } of BUSINESS_FIELDS) {
    const isBusiness = { targetField: field, setHidden: false };
    const isResidential = { targetField: field, setHidden: true };
    form
      .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_HIDDEN, {
        params: isBusiness,
        onParam: onKind("business"),
      })
      .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_HIDDEN, {
        params: isResidential,
        onParam: onKind("residential"),
      });
    if (!required) continue;
    form
      .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_REQUIRED, {
        params: { targetField: field, setRequired: true },
        onParam: onKind("business"),
      })
      .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_REQUIRED, {
        params: { targetField: field, setRequired: false },
        onParam: onKind("residential"),
      });
  }
  return form;
}

@RegisterPage()
export class PageHelioCustomerNew extends PageController(
  "customer-new",
  {
    displayName: "$helio.crm.customers.form.newTitle",
    description: "$helio.crm.customers.form.newDescription",
    icon: "i-ph-user-plus",
    category: PageHelioCustomers,
    urlSlug: "table/new",
    hidden: true,
    permission: customersTableAction("add"),
  },
  FormPageLayout(),
) {
  // Saved, the list opens on the new customer's quick view: the data API's
  // `new` route answers the created row (interface-data-api#43), hence the
  // token `response._id`. The page heading already names the form: the card carries
  // no title of its own.
  static form = withBusinessFields(
    ResourceForm(customerController, {
      mode: "new",
      submitLabel: "$helio.crm.customers.form.create",
      redirectOnSuccess: `${CUSTOMERS_URL}?record={{response._id}}`,
    }),
  );
}

@RegisterPage()
export class PageHelioCustomerEdit extends PageController(
  "customer-edit",
  {
    displayName: "$helio.crm.customers.form.editTitle",
    icon: "i-ph-pencil-simple",
    category: PageHelioCustomers,
    urlSlug: "table/:id/edit",
    hidden: true,
    permission: customersTableAction("edit"),
  },
  FormPageLayout(),
) {
  // Saved, back to the list as the user left it.
  static form = withBusinessFields(
    ResourceForm(customerController, {
      mode: "edit",
      rowId: ROUTE_PARAM_ROW_ID,
      labelKey: "name",
    }),
  ).watch(
    FormEvents.SUBMIT_SUCCESS,
    TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
    {
      params: { url: CUSTOMERS_URL },
    },
  );
}
