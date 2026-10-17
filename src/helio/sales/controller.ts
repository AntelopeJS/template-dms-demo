import { randomBytes } from "node:crypto";
import { Controller, type ControllerClass } from "@antelopejs/interface-api";
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
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  type CellSubline,
  Column,
  DefaultDisplays,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import { customerController, dealController } from "../crm/controller";
import { PRODUCT_ROSTER } from "../shared/roster";
import { DAY_MS } from "../shared/seed";
import { Quote, type QuoteLine, QuoteModel } from "./database";
import { quoteTotals, VAT_RESIDENTIAL } from "./lines";

// A quote's life, in order. Exported for the status tabs, views and actions.
export const QUOTE_STATUSES = [
  {
    value: "draft",
    label: "$helio.sales.quotes.statuses.draft",
    icon: "i-ph-pencil-simple-line",
    iconColor: "neutral",
    textColor: "neutral",
  },
  {
    value: "sent",
    label: "$helio.sales.quotes.statuses.sent",
    icon: "i-ph-paper-plane-tilt",
    iconColor: "info",
    textColor: "info",
  },
  {
    value: "accepted",
    label: "$helio.sales.quotes.statuses.accepted",
    icon: "i-ph-seal-check",
    iconColor: "success",
    textColor: "success",
  },
  {
    value: "rejected",
    label: "$helio.sales.quotes.statuses.rejected",
    icon: "i-ph-x-circle",
    iconColor: "error",
    textColor: "error",
  },
  {
    value: "expired",
    label: "$helio.sales.quotes.statuses.expired",
    icon: "i-ph-hourglass-simple-low",
    iconColor: "warning",
    textColor: "warning",
  },
] as const;

// The products a quote line picks from: the catalog roster, by name (data,
// not a translation).
export const QUOTE_PRODUCT_ITEMS = PRODUCT_ROSTER.map((product) => ({
  value: product.id,
  label: product.name,
}));

// A sent quote this close to its end of validity is flagged.
const EXPIRING_WITHIN_MS = 7 * DAY_MS;

const day = (date: Date) =>
  ({ type: "date", value: date.toISOString(), format: "day" }) as const;

// Not exported on purpose: emitting a .d.ts for this class would require
// naming types from the nested @antelopejs/interface-core copies (TS2742).
@RegisterDataController()
class quoteDataAPI extends DataController(
  Quote,
  TableViewRoutes.All,
  Controller("/api/helio/quotes"),
) {
  @ModelReference()
  @Model(QuoteModel)
  declare model: QuoteModel;

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
    name: "$helio.sales.quotes.columns.number",
    type: new DefaultDataTypes.StringType({
      placeholder: "$helio.sales.quotes.placeholders.number",
      maxLength: 20,
    }),
    filterable: true,
    size: 170,
    display: new DefaultDisplays.TwoLineDisplay({ subField: "linesSummary" }),
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare number: string;

  @Select()
  @Listable()
  @Exported()
  @Column({
    name: "$helio.sales.quotes.columns.customer",
    type: new DefaultDataTypes.RelationType({
      dataApiController: customerController,
      keyMapping: { label: "name", value: "_id" },
      placeholder: "$helio.sales.quotes.placeholders.customer",
      addForm: {
        displayName: "$helio.sales.quotes.addCustomer.title",
        description: "$helio.sales.quotes.addCustomer.description",
      },
    }),
    filterable: true,
    size: 220,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare customer: string;

  @Listable()
  @Column({
    name: "$helio.sales.quotes.columns.deal",
    type: new DefaultDataTypes.RelationType({
      dataApiController: dealController,
      keyMapping: { label: "title", value: "_id" },
      placeholder: "$helio.sales.quotes.placeholders.deal",
      deselectable: true,
    }),
    filterable: true,
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare deal: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.sales.quotes.columns.status",
    type: new DefaultDataTypes.SelectType({ items: [...QUOTE_STATUSES] }),
    filterable: true,
    defaultValue: "draft",
    display: new DefaultDisplays.StatusPillDisplay({
      tones: {
        draft: "neutral",
        sent: "info",
        accepted: "success",
        rejected: "error",
        expired: "warning",
      },
      subField: "statusDetail",
      subTone: "muted",
      liveValues: ["sent"],
    }),
    size: 170,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare status: string;

  // The lines are the source of truth: writing them (or the VAT rate)
  // recomputes subtotal and total, so the stored amounts always add up.
  @Listable(["lines"])
  @Column({
    name: "$helio.sales.quotes.columns.lines",
    type: new DefaultDataTypes.ArrayType({
      of: {
        product: {
          type: new DefaultDataTypes.SelectType({ items: QUOTE_PRODUCT_ITEMS }),
          label: "$helio.sales.quotes.lines.product",
          required: true,
        },
        label: {
          type: new DefaultDataTypes.StringType({ maxLength: 160 }),
          label: "$helio.sales.quotes.lines.label",
          required: true,
        },
        qty: {
          type: new DefaultDataTypes.NumberType({ min: 0, step: 1 }),
          label: "$helio.sales.quotes.lines.qty",
          required: true,
        },
        unitPrice: {
          type: new DefaultDataTypes.PriceType(),
          label: "$helio.sales.quotes.lines.unitPrice",
          required: true,
        },
      },
      sortable: true,
      min: 1,
      addLabel: "$helio.sales.quotes.lines.add",
    }),
    isVisible: false,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  get lines(): QuoteLine[] {
    return this.table.lines;
  }
  set lines(value: QuoteLine[]) {
    this.table.lines = value;
    this.applyTotals();
  }

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.sales.quotes.columns.subtotal",
    type: new DefaultDataTypes.PriceType(),
    filterable: true,
    size: 130,
  })
  @Access(AccessMode.ReadOnly)
  declare subtotal: number;

  @Listable(["vatRate"])
  @Exported(["vatRate"])
  @Column({
    name: "$helio.sales.quotes.columns.vatRate",
    type: new DefaultDataTypes.PercentageType({ max: 0.21 }),
    filterable: true,
    defaultValue: VAT_RESIDENTIAL,
    isVisible: false,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  get vatRate(): number {
    return this.table.vatRate;
  }
  set vatRate(value: number) {
    this.table.vatRate = value;
    this.applyTotals();
  }

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.sales.quotes.columns.total",
    type: new DefaultDataTypes.PriceType(),
    filterable: true,
    size: 130,
  })
  @Access(AccessMode.ReadOnly)
  declare total: number;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.sales.quotes.columns.issuedAt",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({ style: "day" }),
    size: 130,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare issuedAt: Date;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.sales.quotes.columns.validUntil",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({
      soonWithinMs: EXPIRING_WITHIN_MS,
      soonTone: "warning",
      pastStyle: "day",
      pastTone: "dimmed",
    }),
    size: 140,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare validUntil: Date;

  @Listable()
  @Sortable()
  @Column({
    name: "$helio.sales.quotes.columns.sentAt",
    type: new DefaultDataTypes.DateType(),
    display: new DefaultDisplays.RelativeDateDisplay(),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare sentAt: Date;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.sales.quotes.columns.signedAt",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({ style: "day" }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare signedAt: Date;

  // The secret of the customer portal link: drawn when the quote is created
  // ("Copy portal link" reads it), never typed in.
  @Listable(["portalToken"])
  @Column({
    name: "$helio.sales.quotes.columns.portalToken",
    type: new DefaultDataTypes.StringType({ copyable: true }),
    isVisible: false,
  })
  @Access(AccessMode.ReadOnly, { new: AccessMode.ReadWrite })
  get portalToken(): string {
    return this.table.portalToken;
  }
  set portalToken(_value: string) {
    this.table.portalToken ||= randomBytes(12).toString("hex");
  }

  @Column({
    name: "$helio.sales.quotes.columns.notes",
    type: new DefaultDataTypes.StringType({
      textarea: true,
      rows: 3,
      placeholder: "$helio.sales.quotes.placeholders.notes",
    }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare notes: string;

  // VAT of the quote, for the footer and the document.
  @Listable(["subtotal", "total"])
  @Column({
    name: "$helio.sales.quotes.columns.vatAmount",
    type: new DefaultDataTypes.PriceType(),
    validate: false,
    isVisible: false,
  })
  @Access(AccessMode.ReadOnly)
  get vatAmount(): number {
    return (
      Math.round(((this.table.total ?? 0) - (this.table.subtotal ?? 0)) * 100) /
      100
    );
  }

  // Under the number: the first line and how many follow.
  @Listable(["lines"])
  @Access(AccessMode.ReadOnly)
  get linesSummary(): ComposedText | null {
    const [first, ...others] = this.table.lines ?? [];
    if (!first) return null;
    return {
      key: "$helio.sales.quotes.linesSummary",
      params: {
        label: first.label,
        count: { type: "count", value: others.length },
      },
    };
  }

  // Under the status pill: when it was signed, or until when it holds
  // (orange in its last week).
  @Listable(["status", "validUntil", "signedAt"])
  @Access(AccessMode.ReadOnly)
  get statusDetail(): CellSubline | null {
    const { status, validUntil, signedAt } = this.table;
    if (status === "accepted" && signedAt) {
      return {
        text: {
          key: "$helio.sales.quotes.detail.signed",
          params: { date: day(signedAt) },
        },
      };
    }
    if ((status === "sent" || status === "draft") && validUntil) {
      const soon = validUntil.getTime() - Date.now() < EXPIRING_WITHIN_MS;
      return {
        text: {
          key: "$helio.sales.quotes.detail.validUntil",
          params: { date: day(validUntil) },
        },
        tone: soon && status === "sent" ? "warning" : undefined,
      };
    }
    return null;
  }

  private applyTotals(): void {
    const { subtotal, total } = quoteTotals(
      this.table.lines ?? [],
      this.table.vatRate ?? VAT_RESIDENTIAL,
    );
    this.table.subtotal = subtotal;
    this.table.total = total;
  }
}

// ControllerClass-typed alias for relations and pages (see the TS2742 note).
export const quoteController: ControllerClass = quoteDataAPI;
