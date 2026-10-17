// A strip under the dashboard header, on every page, while invoices are
// overdue: how many and how much, with a button to the overdue tab. Resolved
// per request, so it goes away by itself once the last one is paid.

import { GetModel } from "@antelopejs/interface-database-decorators";
import { tableViewLink } from "@antelopejs/interface-dms/base/table-view";
import {
  type LayoutBannerContext,
  LayoutBannerVariant,
  RegisterLayoutBanner,
} from "@antelopejs/interface-dms/layout-banners";
import { sweepOverdueInvoices } from "./actions";
import { InvoiceModel } from "./database";
import { PageHelioInvoices } from "./page";
import { invoiceListAction } from "./table";

// Only those who may read the invoices hear about them.
function canReadInvoices(context: LayoutBannerContext): boolean {
  const permissionId = invoiceListAction.permissionId;
  return (
    context.isOwner || (!!permissionId && context.permissions.has(permissionId))
  );
}

RegisterLayoutBanner({
  key: "helio:invoices-overdue",
  variant: LayoutBannerVariant.WARNING,
  icon: "i-ph-warning-circle",
  order: 10,
  resolve: async (context) => {
    if (!context.user || !canReadInvoices(context)) return undefined;
    await sweepOverdueInvoices();
    const overdue = await GetModel(InvoiceModel).getBy("status", "overdue");
    if (overdue.length === 0) return undefined;
    const amount = overdue.reduce(
      (total, invoice) => total + invoice.amountDue,
      0,
    );
    return {
      text: {
        key: "$helio.finance.banner.overdue",
        params: {
          count: { type: "count", value: overdue.length },
          amount: {
            type: "money",
            value: Math.round(amount * 100),
            currency: "EUR",
          },
        },
      },
      actions: [
        {
          label: "$helio.finance.banner.action",
          to: tableViewLink(PageHelioInvoices, "table", { tab: "overdue" }),
          icon: "i-ph-arrow-right",
        },
      ],
    };
  },
});
