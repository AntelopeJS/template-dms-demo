import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import { DefaultLayout } from "@antelopejs-private/cms/interfaces/cms-base/layouts";
import { TableView } from "@antelopejs-private/cms/interfaces/cms-base/table-view";
import { demoAppCategory } from "./category";
// Value import, not a type-only one: evaluating this module is what registers
// the data controllers the TableViews below reference.
import {
  appProjectDataAPI,
  appTaskDataAPI,
  appUserDataAPI,
  TASK_STATUSES,
  USER_ROLES,
} from "./data-controllers";

@RegisterPage()
export class PageDemoAppUsers extends PageController(
  "users",
  {
    displayName: "$demo.nav.users",
    icon: "i-ph-users",
    category: demoAppCategory,
    order: 0,
    description: "$demo.pages.users.description",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(appUserDataAPI, {
    caption: "$demo.app.users.caption",
    labelKey: "name",
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      details: true,
      hasSelection: true,
    },
    defaultSort: { field: "name" },
    tabs: USER_ROLES.map((role) => ({
      id: role.value,
      label: role.label,
      icon: role.icon,
      iconColor: role.iconColor,
      textColor: role.textColor,
      filters: [
        { accessorKey: "role", value: role.value, mode: "is" as const },
      ],
    })),
  });
}

@RegisterPage()
export class PageDemoAppProjects extends PageController(
  "projects",
  {
    displayName: "$demo.nav.projects",
    icon: "i-ph-kanban",
    category: demoAppCategory,
    order: 1,
    description: "$demo.pages.projects.description",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(appProjectDataAPI, {
    caption: "$demo.app.projects.caption",
    labelKey: "name",
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      details: true,
      hasSelection: true,
    },
    defaultSort: { field: "startDate", desc: true },
  });
}

@RegisterPage()
export class PageDemoAppTasks extends PageController(
  "tasks",
  {
    displayName: "$demo.nav.tasks",
    icon: "i-ph-check-square",
    category: demoAppCategory,
    order: 2,
    description: "$demo.pages.tasks.description",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(appTaskDataAPI, {
    caption: "$demo.app.tasks.caption",
    labelKey: "name",
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      details: true,
      hasSelection: true,
    },
    defaultSort: { field: "dueDate" },
    // New in cms 0.0.16: kanban display mode. Cards are grouped by the
    // status SelectType column and can be dragged between columns.
    kanban: {
      groupByField: "status",
      cardFields: ["priority", "assignee", "dueDate", "progress"],
    },
    defaultDisplay: "kanban",
    tabs: [
      ...TASK_STATUSES.map((status) => ({
        id: status.value,
        label: status.label,
        icon: status.icon,
        iconColor: status.iconColor,
        textColor: status.textColor,
        filters: [
          { accessorKey: "status", value: status.value, mode: "is" as const },
        ],
      })),
      {
        id: "high_priority",
        label: "$demo.app.tasks.tabs.highPriority",
        icon: "i-ph-fire",
        iconColor: "error",
        textColor: "error",
        filters: [{ accessorKey: "priority", value: "high", mode: "is" }],
      },
    ],
  });
}
