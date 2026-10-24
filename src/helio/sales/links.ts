// URLs of the quotes page and of the routes its row actions call, kept apart
// from the page class so the routes and the page can both read them without
// importing each other.

/** The quotes page (contract: /helio/sales/<page id>). */
export const QUOTES_PAGE_URL = "/helio/sales/quotes";

/** The routes of the quote row actions (send, accept, document…). */
export const QUOTE_ACTIONS_API = "/api/helio/quote-actions";

/** A quote action route, for the row named by `{{row._id}}`. */
export function quoteActionUrl(action: string): string {
  return `${QUOTE_ACTIONS_API}/${action}?id={{row._id}}`;
}

/** Where a customer opens the quote sent to them (a fictional portal). */
export const PORTAL_BASE_URL = "https://portail.helio.example/devis";
