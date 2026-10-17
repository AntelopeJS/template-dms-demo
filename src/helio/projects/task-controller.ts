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
  Column,
  DefaultDisplays,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { DAY_MS } from "../shared/seed";
import { teamController } from "../team/controller";
import { ProjectTask, ProjectTaskModel } from "./database";
import { projectController } from "./project-controller";

// A task's state on the project board. Exported for tabs and kanban columns.
export const PROJECT_TASK_STATUSES = [
  {
    value: "todo",
    label: "$helio.projects.taskStatuses.todo",
    icon: "i-ph-circle-dashed",
    iconColor: "neutral",
    textColor: "neutral",
  },
  {
    value: "doing",
    label: "$helio.projects.taskStatuses.doing",
    icon: "i-ph-circle-half",
    iconColor: "primary",
    textColor: "primary",
  },
  {
    value: "done",
    label: "$helio.projects.taskStatuses.done",
    icon: "i-ph-check-circle",
    iconColor: "success",
    textColor: "success",
  },
] as const;

// Not exported on purpose: emitting a .d.ts for this class would require
// naming types from the nested @antelopejs/interface-core copies (TS2742).
@RegisterDataController()
class projectTaskDataAPI extends DataController(
  ProjectTask,
  TableViewRoutes.All,
  Controller("/api/helio/project-tasks"),
) {
  @ModelReference()
  @Model(ProjectTaskModel)
  declare model: ProjectTaskModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  // Manual order within a project (`reorder: { field: "position" }`).
  @Listable()
  @Sortable()
  @Column({
    name: "$helio.projects.tasks.columns.position",
    type: new DefaultDataTypes.NumberType(),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare position: number;

  @Searchable()
  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.projects.tasks.columns.title",
    type: new DefaultDataTypes.StringType({
      placeholder: "$helio.projects.tasks.placeholders.title",
      maxLength: 160,
    }),
    filterable: true,
    size: 320,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.projects.tasks.columns.project",
    type: new DefaultDataTypes.RelationType({
      dataApiController: projectController,
      keyMapping: { label: "name", value: "_id" },
      placeholder: "$helio.projects.tasks.placeholders.project",
    }),
    filterable: true,
    size: 240,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare project: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.projects.tasks.columns.status",
    type: new DefaultDataTypes.SelectType({
      items: [...PROJECT_TASK_STATUSES],
    }),
    filterable: true,
    defaultValue: "todo",
    display: new DefaultDisplays.StatusPillDisplay({
      tones: { todo: "neutral", doing: "primary", done: "success" },
      liveValues: ["doing"],
    }),
    size: 130,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare status: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.projects.tasks.columns.assignee",
    type: new DefaultDataTypes.RelationType({
      dataApiController: teamController,
      keyMapping: { label: "name", value: "_id", avatar: "avatar" },
      placeholder: "$helio.projects.tasks.placeholders.assignee",
      deselectable: true,
    }),
    filterable: true,
    size: 190,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare assignee: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.projects.tasks.columns.dueDate",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({
      style: "day",
      soonWithinMs: 3 * DAY_MS,
      soonTone: "warning",
    }),
    size: 130,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare dueDate: Date;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.projects.tasks.columns.estimateHours",
    type: new DefaultDataTypes.NumberType({
      min: 0,
      step: 0.5,
      suffix: "$helio.projects.units.hours",
    }),
    size: 110,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare estimateHours: number;
}

// ControllerClass-typed alias for relations and pages (see the TS2742 note).
export const projectTaskController: ControllerClass = projectTaskDataAPI;
