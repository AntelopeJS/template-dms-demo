import { HTTPResult } from "@antelopejs/interface-api";
import { FormEvents, FormFunctions } from "@antelopejs/interface-dms/base/form";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  ResourceForm,
  TableView,
  type TableViewFormWatch,
} from "@antelopejs/interface-dms/base/table-view";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { helioSalesCategory } from "../category";
import {
  DEAL_STAGES,
  dealController,
  STAGE_PROBABILITY,
} from "./deal-controller";
import { afterDealEdit, afterDealNew } from "./deal-derived";
import { CUSTOMER_QUICK_VIEW_URL } from "./links";
import { PIPELINE_VIEWS } from "./pipeline-views";

// Deals still in play, for the footer figures: a summary rule reads stored
// fields, so it names the closed stages rather than the computed isOpen.
const OPEN_DEAL = { field: "stage", notIn: ["won", "lost"] };

// The loss reason belongs to a lost deal only: shown, and required, once the
// stage is "lost", hidden before. FIELD_CHANGE also fires once with the value
// the form starts from, so an opened form is right before any change.
const LOST_REASON_WATCHES: TableViewFormWatch[] = DEAL_STAGES.flatMap(
  ({ value }) => {
    const onStage = [
      { key: "fieldId", value: "stage" },
      { key: "value", value },
    ];
    const lost = value === "lost";
    return [
      {
        event: FormEvents.FIELD_CHANGE,
        functionId: FormFunctions.SET_FIELD_HIDDEN,
        params: { targetField: "lostReason", setHidden: !lost },
        onParam: onStage,
      },
      {
        event: FormEvents.FIELD_CHANGE,
        functionId: FormFunctions.SET_FIELD_REQUIRED,
        params: { targetField: "lostReason", setRequired: lost },
        onParam: onStage,
      },
    ];
  },
);

// The probability follows the stage as it is picked, before the save: each
// stage's usual figure (100 % won, 0 % lost), which the owner may still
// adjust on an open deal. A won or lost deal's figure is implied (the write
// routes store 100 % or 0 % whatever is sent, see deal-derived.ts), so the
// field is locked on those stages. Only a change writes the value: a form
// opens with the probability the deal stored.
const PROBABILITY_BY_STAGE: Record<string, number> = { ...STAGE_PROBABILITY };

const PROBABILITY_WATCHES: TableViewFormWatch[] = [
  {
    event: FormEvents.FIELD_CHANGE,
    functionId: FormFunctions.SET_FIELD_VALUE,
    params: { targetField: "probability", valueMap: PROBABILITY_BY_STAGE },
    onParam: { key: "fieldId", value: "stage" },
  },
  ...DEAL_STAGES.map(({ value }) => ({
    event: FormEvents.FIELD_CHANGE,
    functionId: FormFunctions.SET_FIELD_DISABLED,
    params: {
      targetField: "probability",
      setDisabled: value === "won" || value === "lost",
    },
    onParam: [
      { key: "fieldId", value: "stage" },
      { key: "value", value },
    ],
  })),
];

const EDIT_FORM_WATCHES = [...LOST_REASON_WATCHES, ...PROBABILITY_WATCHES];

// The write routes refuse a lost deal without its reason, whichever client
// sent it (a card dropped on "Lost" included: the deal is opened to say why).
function assertLostReason(stage: unknown, lostReason: unknown): void {
  if (stage !== "lost") return;
  if (typeof lostReason === "string" && lostReason !== "") return;
  throw new HTTPResult(400, {
    message: "$helio.crm.deals.errors.lostReasonRequired",
    field: "lostReason",
  });
}

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
    rowClick: "single",
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
    // "Deals" of a customer (customers page): ?customer=<id>, and the deals
    // of a sales rep (dashboard leaderboard): ?owner=<id>, as chips.
    queryParamFilters: {
      customer: {
        field: "customer",
        visible: true,
        label: "$helio.crm.pipeline.customerChip",
      },
      owner: {
        field: "owner",
        visible: true,
        label: "$helio.crm.pipeline.ownerChip",
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
        // A click on a deal (a card of the board or a row), its "Quick view"
        // and `?record=<deal id>` (the dashboard's activity feed, a
        // customer's deals) open the deal read-only in a right drawer; "Edit"
        // from the menu opens the form.
        {
          id: "quick-view",
          label: "$helio.crm.pipeline.quickView.action",
          icon: "i-ph-sidebar-simple",
          isDefault: true,
          target: {
            type: "drawer",
            direction: "right",
            title: "$helio.crm.pipeline.quickView.title",
            description: "$helio.crm.pipeline.quickView.description",
            rowTitle: "{title}",
            positionLabel: "$helio.crm.pipeline.quickView.position",
            deepLink: true,
            notFound: {
              title: "$helio.crm.pipeline.quickView.notFoundTitle",
              description: "$helio.crm.pipeline.quickView.notFoundDescription",
            },
            component: ResourceForm(dealController, {
              mode: "view",
              rowId: "{{row._id}}",
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
    formWatches: {
      new: EDIT_FORM_WATCHES,
      edit: EDIT_FORM_WATCHES,
      view: LOST_REASON_WATCHES,
    },
    // A lost deal says why; the stored derived fields follow each write (see
    // deal-derived.ts). An edit only sends what changed: the stored row
    // fills the rest.
    guards: {
      new: (_ctx, { body }) => {
        assertLostReason(body.stage, body.lostReason);
        return afterDealNew(body);
      },
      edit: (_ctx, { id, body, current }) => {
        const row = { ...current, ...body };
        assertLostReason(row.stage, row.lostReason);
        return afterDealEdit(id, body, current);
      },
    },
  });
}
