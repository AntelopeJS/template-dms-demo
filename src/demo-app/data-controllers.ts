// The data controllers and the option lists their columns read, split out of
// pages.ts to keep both files under the size the linter allows. Importing this
// module is what evaluates the @RegisterDataController decorators, so pages.ts
// must keep importing it before it declares its own pages: the controllers have
// to be registered by the time a TableView references one.

import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Foreign,
  Listable,
  Mandatory,
  ModelReference,
  Optional,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs-private/cms/interfaces/cms-base/data-types/default-types";
import { Searchable } from "@antelopejs-private/cms/interfaces/cms-base/searchable";
import {
  ArchiveField,
  Column,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs-private/cms/interfaces/cms-base/table-view";
import {
  AppProject,
  AppProjectModel,
  AppTask,
  AppTaskModel,
  AppUser,
  AppUserModel,
} from "./database";

export const USER_ROLES = [
  {
    value: "admin",
    label: "$demo.app.users.roles.admin",
    icon: "i-ph-shield-star",
    iconColor: "error",
    textColor: "error",
  },
  {
    value: "manager",
    label: "$demo.app.users.roles.manager",
    icon: "i-ph-users-three",
    iconColor: "info",
    textColor: "info",
  },
  {
    value: "member",
    label: "$demo.app.users.roles.member",
    icon: "i-ph-user",
    iconColor: "neutral",
    textColor: "neutral",
  },
] as const;

export const PROJECT_STATUSES = [
  {
    value: "planned",
    label: "$demo.app.projects.statuses.planned",
    icon: "i-ph-calendar-plus",
    iconColor: "neutral",
    textColor: "neutral",
  },
  {
    value: "active",
    label: "$demo.app.projects.statuses.active",
    icon: "i-ph-play-circle",
    iconColor: "success",
    textColor: "success",
  },
  {
    value: "on_hold",
    label: "$demo.app.projects.statuses.onHold",
    icon: "i-ph-pause-circle",
    iconColor: "warning",
    textColor: "warning",
  },
  {
    value: "completed",
    label: "$demo.app.projects.statuses.completed",
    icon: "i-ph-check-circle",
    iconColor: "info",
    textColor: "info",
  },
] as const;

export const TASK_STATUSES = [
  {
    value: "pending",
    label: "$demo.app.tasks.statuses.pending",
    icon: "i-ph-clock",
    iconColor: "warning",
    textColor: "warning",
  },
  {
    value: "in_progress",
    label: "$demo.app.tasks.statuses.inProgress",
    icon: "i-ph-spinner",
    iconColor: "info",
    textColor: "info",
  },
  {
    value: "completed",
    label: "$demo.app.tasks.statuses.completed",
    icon: "i-ph-check-circle",
    iconColor: "success",
    textColor: "success",
  },
  {
    value: "cancelled",
    label: "$demo.app.tasks.statuses.cancelled",
    icon: "i-ph-x-circle",
    iconColor: "error",
    textColor: "error",
  },
] as const;

export const TASK_PRIORITIES = [
  { value: "low", label: "$demo.app.tasks.priorities.low" },
  { value: "medium", label: "$demo.app.tasks.priorities.medium" },
  { value: "high", label: "$demo.app.tasks.priorities.high" },
] as const;

// The three data controllers are intentionally not exported: emitting .d.ts
// for them would require naming types from the nested
// @antelopejs/interface-core copies (TS2742). The @RegisterDataController
// decorator registers them as a side effect, and the relation columns
// reference them directly within this file.

@RegisterDataController()
export class appUserDataAPI extends DataController(
  AppUser,
  TableViewRoutes.All,
  Controller("/api/demo-app/users"),
) {
  @ModelReference()
  @Model(AppUserModel)
  declare model: AppUserModel;

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
    name: "$demo.app.users.columns.name",
    type: new DefaultDataTypes.StringType({ placeholder: "Jane Doe" }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "$demo.app.users.columns.email",
    type: new DefaultDataTypes.EmailType({
      placeholder: "jane@example.com",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare email: string;

  @Listable()
  @Exported()
  @Column({
    name: "$demo.app.users.columns.phone",
    type: new DefaultDataTypes.PhoneType({
      placeholder: "+32 470 12 34 56",
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare phone: string;

  @Listable()
  @Exported()
  @Column({
    name: "$demo.app.users.columns.role",
    type: new DefaultDataTypes.SelectType({ items: [...USER_ROLES] }),
    filterable: true,
    defaultValue: "member",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare role: string;

  @Select()
  @Column({
    name: "$demo.app.users.columns.avatar",
    type: new DefaultDataTypes.UrlType({
      placeholder: "https://example.com/avatar.png",
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare avatar: string;

  @Listable()
  @Column({
    name: "$demo.app.users.columns.active",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
    defaultValue: true,
  })
  @Access(AccessMode.ReadWrite)
  declare isActive: boolean;

  @Listable()
  @Sortable()
  @Column({
    name: "$demo.app.users.columns.hiredAt",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare hiredAt: Date;
}

@RegisterDataController()
export class appProjectDataAPI extends DataController(
  AppProject,
  TableViewRoutes.All,
  Controller("/api/demo-app/projects"),
) {
  @ModelReference()
  @Model(AppProjectModel)
  declare model: AppProjectModel;

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
    name: "$demo.app.projects.columns.name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Website redesign",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Column({
    name: "$demo.app.projects.columns.description",
    type: new DefaultDataTypes.RichTextType({
      placeholder: "Describe the project...",
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare description: string;

  @Listable()
  @Exported()
  @Column({
    name: "$demo.app.projects.columns.status",
    type: new DefaultDataTypes.SelectType({ items: [...PROJECT_STATUSES] }),
    filterable: true,
    defaultValue: "planned",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare status: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$demo.app.projects.columns.startDate",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare startDate: Date;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$demo.app.projects.columns.endDate",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare endDate: Date;

  @Listable()
  @Exported()
  @Column({
    name: "$demo.app.projects.columns.budget",
    type: new DefaultDataTypes.PriceType({ min: 0, step: 500 }),
    filterable: true,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare budget: number;

  @Listable()
  @Column({
    name: "$demo.app.projects.columns.progress",
    type: new DefaultDataTypes.PercentageType({ min: 0, max: 1, step: 0.05 }),
    defaultValue: 0,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare progress: number;

  @ArchiveField()
  @Access(AccessMode.ReadOnly)
  declare isArchived: boolean;
}

@RegisterDataController()
export class appTaskDataAPI extends DataController(
  AppTask,
  TableViewRoutes.All,
  Controller("/api/demo-app/tasks"),
) {
  @ModelReference()
  @Model(AppTaskModel)
  declare model: AppTaskModel;

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
    name: "$demo.app.tasks.columns.name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Design the homepage",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Column({
    name: "$demo.app.tasks.columns.description",
    type: new DefaultDataTypes.RichTextType({
      placeholder: "Describe the task...",
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare description: string;

  @Listable()
  @Exported()
  @Column({
    name: "$demo.app.tasks.columns.status",
    type: new DefaultDataTypes.SelectType({ items: [...TASK_STATUSES] }),
    filterable: true,
    defaultValue: "pending",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare status: string;

  @Listable()
  @Column({
    name: "$demo.app.tasks.columns.priority",
    type: new DefaultDataTypes.SelectType({ items: [...TASK_PRIORITIES] }),
    filterable: true,
    defaultValue: "medium",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare priority: string;

  @Listable()
  @Exported()
  @Column({
    name: "$demo.app.tasks.columns.project",
    type: new DefaultDataTypes.RelationType({
      placeholder: "Select a project...",
      dataApiController: appProjectDataAPI,
      keyMapping: { label: "name", value: "_id" },
    }),
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  @Foreign(AppProject)
  declare project: string;

  @Listable()
  @Exported()
  @Column({
    name: "$demo.app.tasks.columns.assignee",
    type: new DefaultDataTypes.RelationType({
      placeholder: "Select a user...",
      dataApiController: appUserDataAPI,
      keyMapping: { label: "name", value: "_id", avatar: "avatar" },
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  @Foreign(AppUser)
  declare assignee: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$demo.app.tasks.columns.dueDate",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare dueDate: Date;

  @Listable()
  @Column({
    name: "$demo.app.tasks.columns.estimate",
    type: new DefaultDataTypes.NumberType({ min: 0, max: 200, step: 1 }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare estimateHours: number;

  @Listable()
  @Column({
    name: "$demo.app.tasks.columns.progress",
    type: new DefaultDataTypes.PercentageType({ min: 0, max: 1, step: 0.05 }),
    defaultValue: 0,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare progress: number;

  @Listable()
  @Column({
    name: "$demo.app.tasks.columns.done",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
    defaultValue: false,
  })
  @Access(AccessMode.ReadWrite)
  declare done: boolean;

  @ArchiveField()
  @Access(AccessMode.ReadOnly)
  declare isArchived: boolean;
}
