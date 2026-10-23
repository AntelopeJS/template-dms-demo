// URLs the CRM pages link to each other with. Written once here, against the
// page ids and categories of the Helio contract (/helio/sales/<page id>).

export const PIPELINE_URL = "/helio/sales/pipeline";
export const CUSTOMERS_URL = "/helio/sales/customers";

// Pages of the other domains a customer links to, each narrowed to that
// customer by its `?customer=<id>` filter.
export const QUOTES_URL = "/helio/sales/quotes";
export const PROJECTS_URL = "/helio/operations/projects";
export const INVOICES_URL = "/helio/invoices";

// The customers page opens a customer's quick view from `?record=<id>`.
export const CUSTOMER_QUICK_VIEW_URL = `${CUSTOMERS_URL}?record={{row.customer._id}}`;

// The delete dialog of a customer, worded by the server for that row.
export const CRM_API = "/api/helio/crm";
export const CUSTOMER_DELETE_CONFIRM_URL = `${CRM_API}/customers/{{row._id}}/delete-confirm`;
