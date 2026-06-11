import { Controller } from "@antelopejs/interface-api";
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
import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import { DefaultDataTypes } from "@antelopejs-private/cms/interfaces/cms-base/data-types/default-types";
import { DefaultLayout } from "@antelopejs-private/cms/interfaces/cms-base/layouts";
import { Searchable } from "@antelopejs-private/cms/interfaces/cms-base/searchable";
import {
  ArchiveField,
  Column,
  Exported,
  Select,
  TableView,
  TableViewRoutes,
} from "@antelopejs-private/cms/interfaces/cms-base/table-view";
import { componentsCategory } from "../category";
import { DemoTask, DemoTaskModel } from "./database";

// tabLabel is plain text because TableView tab labels are not translated by
// the frontend (unlike column headers and select item labels).
const TASK_STATUSES = [
  {
    value: "pending",
    label: "$demo.tableView.statuses.pending",
    tabLabel: "Pending",
    icon: "i-ph-clock",
    iconColor: "warning",
    textColor: "warning",
  },
  {
    value: "in_progress",
    label: "$demo.tableView.statuses.inProgress",
    tabLabel: "In progress",
    icon: "i-ph-spinner",
    iconColor: "info",
    textColor: "info",
  },
  {
    value: "completed",
    label: "$demo.tableView.statuses.completed",
    tabLabel: "Completed",
    icon: "i-ph-check-circle",
    iconColor: "success",
    textColor: "success",
  },
  {
    value: "cancelled",
    label: "$demo.tableView.statuses.cancelled",
    tabLabel: "Cancelled",
    icon: "i-ph-x-circle",
    iconColor: "error",
    textColor: "error",
  },
] as const;

// Not exported on purpose: emitting a .d.ts for this class would require
// naming types from the nested @antelopejs/interface-core copies (TS2742).
// The @RegisterDataController decorator registers it as a side effect.
@RegisterDataController()
class demoTaskDataAPI extends DataController(
  DemoTask,
  TableViewRoutes.All,
  Controller("/api/components-demo/tasks"),
) {
  @ModelReference()
  @Model(DemoTaskModel)
  declare model: DemoTaskModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Exported()
  @Column({
    name: "$demo.tableView.columns.name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Enter task name",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "$demo.tableView.columns.email",
    type: new DefaultDataTypes.EmailType({
      placeholder: "Enter assignee email",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare email: string;

  @Listable()
  @Exported()
  @Column({
    name: "$demo.tableView.columns.status",
    type: new DefaultDataTypes.SelectType({
      items: TASK_STATUSES.map(({ tabLabel, ...item }) => item),
    }),
    filterable: true,
    defaultValue: "pending",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare status: string;

  @Listable()
  @Column({
    name: "$demo.tableView.columns.priority",
    type: new DefaultDataTypes.SelectType({
      items: [
        { value: "low", label: "$demo.tableView.priorities.low" },
        { value: "medium", label: "$demo.tableView.priorities.medium" },
        { value: "high", label: "$demo.tableView.priorities.high" },
      ],
    }),
    filterable: true,
    defaultValue: "medium",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare priority: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$demo.tableView.columns.dueDate",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare due_date: Date;

  @Listable()
  @Column({
    name: "$demo.tableView.columns.progress",
    type: new DefaultDataTypes.PercentageType({
      min: 0,
      max: 1,
      step: 0.05,
    }),
    defaultValue: 0,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare progress: number;

  @Listable()
  @Column({
    name: "$demo.tableView.columns.done",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
    defaultValue: false,
  })
  @Access(AccessMode.ReadWrite)
  declare done: boolean;

  @Column({
    name: "$demo.tableView.columns.description",
    type: new DefaultDataTypes.RichTextType({
      placeholder: "Describe the task...",
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare description: string;

  @ArchiveField()
  @Access(AccessMode.ReadOnly)
  declare isArchived: boolean;
}

@RegisterPage()
export class PageComponentTableView extends PageController(
  "table-view",
  {
    displayName: "$demo.nav.tableView",
    icon: "i-ph-table",
    category: componentsCategory,
    order: 3,
    description: "$demo.pages.tableView.description",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(demoTaskDataAPI, {
    caption: "$demo.tableView.caption",
    labelKey: "name",
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      details: true,
      hasSelection: true,
    },
    defaultSort: { field: "due_date" },
    tabs: [
      ...TASK_STATUSES.map((status) => ({
        id: status.value,
        label: status.tabLabel,
        icon: status.icon,
        iconColor: status.iconColor,
        textColor: status.textColor,
        filters: [
          { accessorKey: "status", value: status.value, mode: "is" as const },
        ],
      })),
      {
        id: "high_priority",
        label: "High priority",
        icon: "i-ph-fire",
        iconColor: "error",
        textColor: "error",
        filters: [{ accessorKey: "priority", value: "high", mode: "is" }],
      },
    ],
  });
}
