import {
  Controller,
  type ControllerClass,
  Parameter,
} from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Computed,
  Listable,
  Mandatory,
  ModelReference,
  ModifierKey,
  Optional,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import {
  LocalizationModifier,
  Model,
} from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import {
  Column,
  DefaultDisplays,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { productCategoryController } from "./category-controller";
import { Product, ProductModel } from "./database";

// Option list exported for the pages (filters, grouping).
export const PRODUCT_UNITS = [
  { value: "piece", label: "$helio.catalog.units.piece", icon: "i-ph-package" },
  { value: "hour", label: "$helio.catalog.units.hour", icon: "i-ph-clock" },
  { value: "year", label: "$helio.catalog.units.year", icon: "i-ph-calendar" },
  { value: "flat", label: "$helio.catalog.units.flat", icon: "i-ph-tag" },
] as const;

/** Tags offered while typing; they stay free tags. */
export const PRODUCT_TAGS = [
  "bestseller",
  "résidentiel",
  "entreprises",
  "batterie",
  "borne",
  "hybride",
  "triphasé",
  "service",
  "contrat",
];

// Not exported on purpose: emitting a .d.ts for this class would require
// naming types from the nested @antelopejs/interface-core copies (TS2742).
@RegisterDataController()
class productDataAPI extends DataController(
  Product,
  TableViewRoutes.All,
  Controller("/api/helio/products"),
) {
  @ModelReference()
  @Model(ProductModel)
  declare model: ProductModel;

  // The description is localized: read in the caller's language, every
  // language at once for forms ("*").
  @Parameter("x-content-language", "header")
  @ModifierKey(LocalizationModifier)
  declare language: string;

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
    name: "$helio.catalog.products.columns.name",
    type: new DefaultDataTypes.StringType({
      placeholder: "$helio.catalog.products.placeholders.name",
      maxLength: 80,
    }),
    filterable: true,
    size: 280,
    display: new DefaultDisplays.IdentityDisplay({
      avatarField: "image",
      subtitleField: "sku",
      badges: [
        {
          field: "isActive",
          equals: false,
          label: "$helio.catalog.products.badges.inactive",
          tone: "neutral",
        },
      ],
    }),
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Searchable()
  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.sku",
    type: new DefaultDataTypes.StringType({
      placeholder: "PV-MONO-410",
      maxLength: 24,
    }),
    filterable: true,
    display: new DefaultDisplays.MonoDisplay({ copy: true }),
    size: 150,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare sku: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.category",
    type: new DefaultDataTypes.CascaderRelationType({
      dataApiController: productCategoryController,
      keyMapping: { label: "name", value: "_id", parent: "parent" },
      leafOnly: true,
      placeholder: "$helio.catalog.products.placeholders.category",
    }),
    filterable: true,
    size: 220,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare category: string;

  @Column({
    name: "$helio.catalog.products.columns.description",
    type: new DefaultDataTypes.StringType({
      textarea: true,
      rows: 3,
      maxLength: 300,
      showCount: true,
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare description: string;

  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.price",
    type: new DefaultDataTypes.PriceType(),
    filterable: true,
    size: 120,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare price: number;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.cost",
    type: new DefaultDataTypes.PriceType(),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare cost: number;

  // Gross margin on the price; drawn, not stored.
  @Listable(["price", "cost"])
  @Column({
    name: "$helio.catalog.products.columns.margin",
    type: new DefaultDataTypes.PercentageType(),
    validate: false,
    size: 110,
  })
  @Access(AccessMode.ReadOnly)
  get margin(): number | null {
    const { price, cost } = this.table;
    if (!price || cost === undefined) return null;
    return Math.round(((price - cost) / price) * 1000) / 1000;
  }

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.power",
    type: new DefaultDataTypes.NumberType({
      min: 0,
      step: 10,
      suffix: "$helio.catalog.products.powerSuffix",
    }),
    filterable: true,
    size: 120,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare power: number;

  @Select()
  @Listable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.unit",
    type: new DefaultDataTypes.SelectType({ items: [...PRODUCT_UNITS] }),
    filterable: true,
    defaultValue: "piece",
    size: 110,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare unit: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.stock",
    type: new DefaultDataTypes.NumberType({ min: 0, step: 1 }),
    filterable: true,
    display: new DefaultDisplays.TextDisplay({ toneField: "stockTone" }),
    size: 100,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare stock: number;

  @Listable()
  @Column({
    name: "$helio.catalog.products.columns.stockMin",
    type: new DefaultDataTypes.NumberType({ min: 0, step: 1 }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare stockMin: number;

  // Below the reorder threshold, computed in the database so a view or a
  // quick filter can list the products to reorder.
  @Listable()
  @Computed(
    (row) => {
      const threshold = row.key("stockMin").default(0);
      return threshold.gt(0).and(row.key("stock").default(0).lt(threshold));
    },
    { default: false },
  )
  @Column({
    name: "$helio.catalog.products.columns.lowStock",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
    validate: false,
    display: new DefaultDisplays.IndicatorDisplay({
      onLabel: "$helio.catalog.products.stock.low",
      offLabel: "$helio.catalog.products.stock.ok",
      onIcon: "i-ph-warning",
      offIcon: "i-ph-check-circle",
      onTone: "error",
      offTone: "success",
    }),
    size: 130,
  })
  declare lowStock: boolean;

  @Select()
  @Listable()
  @Column({
    name: "$helio.catalog.products.columns.image",
    type: new DefaultDataTypes.UrlType({ placeholder: "https://…" }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare image: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.tags",
    type: new DefaultDataTypes.TagsType({
      max: 6,
      suggestions: PRODUCT_TAGS,
      placeholder: "$helio.catalog.products.placeholders.tags",
    }),
    filterable: true,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare tags: string[];

  @Listable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.warrantyYears",
    type: new DefaultDataTypes.NumberType({
      min: 0,
      max: 30,
      step: 1,
      suffix: "$helio.catalog.products.yearsSuffix",
    }),
    filterable: true,
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare warrantyYears: number;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.catalog.products.columns.isActive",
    type: new DefaultDataTypes.BooleanType({
      label: "$helio.catalog.products.activeSwitch",
    }),
    filterable: true,
    defaultValue: true,
    display: new DefaultDisplays.IndicatorDisplay({
      onLabel: "$helio.catalog.products.active",
      offLabel: "$helio.catalog.products.badges.inactive",
    }),
    size: 110,
  })
  @Access(AccessMode.ReadWrite)
  declare isActive: boolean;

  // The position a hand-ordered catalog (`reorder`) saves.
  @Listable()
  @Sortable()
  @Column({
    name: "$helio.catalog.products.columns.displayOrder",
    type: new DefaultDataTypes.NumberType({ min: 0, step: 1 }),
    defaultValue: 999,
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare displayOrder: number;

  // The stock in red once below the threshold, orange when close to it.
  @Listable(["stock", "stockMin"])
  @Access(AccessMode.ReadOnly)
  get stockTone(): Tone | null {
    const { stock, stockMin } = this.table;
    if (stock === undefined || !stockMin) return null;
    if (stock < stockMin) return "error";
    return stock < stockMin * 1.5 ? "warning" : null;
  }
}

// ControllerClass-typed alias for quote lines, project pages and the catalog
// (see the TS2742 note above).
export const productController: ControllerClass = productDataAPI;
