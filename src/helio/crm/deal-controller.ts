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
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types";
import {
  type CellSubline,
  Column,
  DefaultDisplays,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { teamController } from "../team/controller";
import { customerController, LEAD_SOURCES } from "./customer-controller";
import { Deal, type DealStage, DealModel } from "./database";

// The pipeline, in order. Exported for the kanban columns, tabs and views.
export const DEAL_STAGES = [
  {
    value: "lead",
    label: "$helio.crm.stages.lead",
    icon: "i-ph-sparkle",
    iconColor: "neutral",
    textColor: "neutral",
  },
  {
    value: "qualified",
    label: "$helio.crm.stages.qualified",
    icon: "i-ph-check-square",
    iconColor: "info",
    textColor: "info",
  },
  {
    value: "site_visit",
    label: "$helio.crm.stages.siteVisit",
    icon: "i-ph-house-line",
    iconColor: "info",
    textColor: "info",
  },
  {
    value: "proposal",
    label: "$helio.crm.stages.proposal",
    icon: "i-ph-file-text",
    iconColor: "primary",
    textColor: "primary",
  },
  {
    value: "negotiation",
    label: "$helio.crm.stages.negotiation",
    icon: "i-ph-chats-circle",
    iconColor: "warning",
    textColor: "warning",
  },
  {
    value: "won",
    label: "$helio.crm.stages.won",
    icon: "i-ph-trophy",
    iconColor: "success",
    textColor: "success",
  },
  {
    value: "lost",
    label: "$helio.crm.stages.lost",
    icon: "i-ph-x-circle",
    iconColor: "error",
    textColor: "error",
  },
] as const;

/** The stages still in play (neither won nor lost). */
export const OPEN_DEAL_STAGES: readonly DealStage[] = [
  "lead",
  "qualified",
  "site_visit",
  "proposal",
  "negotiation",
];

// The default probability of each stage lives with the fixtures that use it.
export { STAGE_PROBABILITY } from "./fixtures";

export const LOST_REASONS = [
  {
    value: "price",
    label: "$helio.crm.lostReasons.price",
    icon: "i-ph-currency-eur",
  },
  {
    value: "competitor",
    label: "$helio.crm.lostReasons.competitor",
    icon: "i-ph-sword",
  },
  {
    value: "timing",
    label: "$helio.crm.lostReasons.timing",
    icon: "i-ph-hourglass",
  },
  {
    value: "financing",
    label: "$helio.crm.lostReasons.financing",
    icon: "i-ph-bank",
  },
  {
    value: "roof",
    label: "$helio.crm.lostReasons.roof",
    icon: "i-ph-house-simple",
  },
  {
    value: "no_response",
    label: "$helio.crm.lostReasons.noResponse",
    icon: "i-ph-phone-slash",
  },
] as const;

const LOST_REASON_LABELS: Record<string, string> = Object.fromEntries(
  LOST_REASONS.map(({ value, label }) => [value, label]),
);

// An open deal untouched for this long reads as stalled.
const STALLED_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

// Not exported on purpose: emitting a .d.ts for this class would require
// naming types from the nested @antelopejs/interface-core copies (TS2742).
@RegisterDataController()
class dealDataAPI extends DataController(
  Deal,
  TableViewRoutes.All,
  Controller("/api/helio/deals"),
) {
  @ModelReference()
  @Model(DealModel)
  declare model: DealModel;

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
    name: "$helio.crm.deals.columns.title",
    type: new DefaultDataTypes.StringType({
      placeholder: "$helio.crm.deals.placeholders.title",
      maxLength: 120,
    }),
    filterable: true,
    size: 280,
    display: new DefaultDisplays.TwoLineDisplay({
      subField: "nextStepLine",
    }),
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Select()
  @Listable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.customer",
    type: new DefaultDataTypes.RelationType({
      dataApiController: customerController,
      keyMapping: { label: "name", value: "_id" },
      placeholder: "$helio.crm.deals.placeholders.customer",
      addForm: {
        displayName: "$helio.crm.deals.addCustomer.title",
        description: "$helio.crm.deals.addCustomer.description",
      },
    }),
    filterable: true,
    size: 220,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare customer: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.stage",
    type: new DefaultDataTypes.SelectType({ items: [...DEAL_STAGES] }),
    filterable: true,
    defaultValue: "lead",
    display: new DefaultDisplays.StatusPillDisplay({
      tones: {
        lead: "neutral",
        qualified: "info",
        site_visit: "info",
        proposal: "primary",
        negotiation: "warning",
        won: "success",
        lost: "error",
      },
      subField: "stageDetail",
      subTone: "muted",
    }),
    size: 170,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare stage: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.amount",
    type: new DefaultDataTypes.PriceType({ step: 100 }),
    filterable: true,
    size: 130,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare amount: number;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.probability",
    type: new DefaultDataTypes.PercentageType({ step: 0.05 }),
    filterable: true,
    defaultValue: 0.1,
    size: 110,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare probability: number;

  // amount × probability, stored with the deal (deal-derived.ts keeps it in
  // step on every write) so it lists, sorts and sums in the pipeline footer.
  // Not @Computed: see deal-derived.ts.
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.weightedAmount",
    type: new DefaultDataTypes.PriceType(),
    validate: false,
    size: 130,
    // Nothing to show before the deal exists; shown, read-only, once it does.
    readonlyBehavior: { new: ReadonlyBehaviorType.hidden },
  })
  @Access(AccessMode.ReadOnly)
  declare weightedAmount: number;

  // Neither won nor lost, stored with the deal (deal-derived.ts keeps it in
  // step): a list filter takes one value per column, so the saved views
  // ("Big deals", "Stalled"…) narrow the open deals through this flag.
  @Listable()
  @Column({
    name: "$helio.crm.deals.columns.isOpen",
    type: new DefaultDataTypes.BooleanType(),
    validate: false,
    filterable: true,
    isVisible: false,
    readonlyBehavior: ReadonlyBehaviorType.hidden,
  })
  @Access(AccessMode.ReadOnly)
  declare isOpen: boolean;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.owner",
    type: new DefaultDataTypes.RelationType({
      dataApiController: teamController,
      keyMapping: { label: "name", value: "_id", avatar: "avatar" },
      placeholder: "$helio.crm.deals.placeholders.owner",
    }),
    filterable: true,
    size: 190,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare owner: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.source",
    type: new DefaultDataTypes.SelectType({ items: [...LEAD_SOURCES] }),
    filterable: true,
    defaultValue: "website",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare source: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.expectedClose",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({
      style: "day",
      soonWithinMs: 7 * DAY_MS,
      soonTone: "warning",
    }),
    size: 150,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare expectedClose: Date;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.lastActivityAt",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({
      nowWithinMs: 60 * 60 * 1000,
      nowLabel: "$helio.crm.deals.activeNow",
    }),
    size: 150,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare lastActivityAt: Date;

  @Searchable()
  @Listable()
  @Column({
    name: "$helio.crm.deals.columns.nextStep",
    type: new DefaultDataTypes.StringType({
      placeholder: "$helio.crm.deals.placeholders.nextStep",
      maxLength: 160,
    }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare nextStep: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.crm.deals.columns.lostReason",
    type: new DefaultDataTypes.SelectType({
      items: [...LOST_REASONS],
      deselectable: true,
    }),
    filterable: true,
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare lostReason: string;

  // Under the title: the next step, in orange once an open deal stalls.
  @Listable(["nextStep", "stage", "lastActivityAt"])
  @Access(AccessMode.ReadOnly)
  get nextStepLine(): CellSubline | null {
    const { nextStep, stage, lastActivityAt } = this.table;
    if (!nextStep) return null;
    const idleMs = lastActivityAt ? Date.now() - lastActivityAt.getTime() : 0;
    const stalled =
      OPEN_DEAL_STAGES.includes(stage) && idleMs > STALLED_DAYS * DAY_MS;
    return { text: nextStep, tone: stalled ? "warning" : undefined };
  }

  // Under the stage pill: why a lost deal was lost.
  @Listable(["stage", "lostReason"])
  @Access(AccessMode.ReadOnly)
  get stageDetail(): string | null {
    const { stage, lostReason } = this.table;
    if (stage !== "lost" || !lostReason) return null;
    return LOST_REASON_LABELS[lostReason] ?? null;
  }
}

// ControllerClass-typed alias for relation columns of other domains (see the
// TS2742 note above).
export const dealController: ControllerClass = dealDataAPI;
