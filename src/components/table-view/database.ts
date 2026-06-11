import {
  BasicDataModel,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs-private/cms/interfaces/cms/constants";

const TABLE_NAME = "components_demo_tasks";

const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

const DEFAULT_TASKS: Array<Partial<DemoTask>> = [
  {
    name: "Design the landing page",
    email: "alice@example.com",
    status: "in_progress",
    priority: "high",
    due_date: daysFromNow(3),
    progress: 0.6,
    done: false,
  },
  {
    name: "Write the onboarding emails",
    email: "bob@example.com",
    status: "pending",
    priority: "medium",
    due_date: daysFromNow(7),
    progress: 0,
    done: false,
  },
  {
    name: "Fix the checkout bug",
    email: "carol@example.com",
    status: "completed",
    priority: "high",
    due_date: daysFromNow(-2),
    progress: 1,
    done: true,
  },
  {
    name: "Update the dependencies",
    email: "dave@example.com",
    status: "pending",
    priority: "low",
    due_date: daysFromNow(14),
    progress: 0,
    done: false,
  },
  {
    name: "Prepare the quarterly review",
    email: "alice@example.com",
    status: "in_progress",
    priority: "medium",
    due_date: daysFromNow(5),
    progress: 0.35,
    done: false,
  },
  {
    name: "Migrate the staging database",
    email: "erin@example.com",
    status: "cancelled",
    priority: "low",
    due_date: daysFromNow(-10),
    progress: 0.1,
    done: false,
    isArchived: true,
  },
];

@RegisterTable(TABLE_NAME, CORE_SCHEMA_NAME)
@Fixture(() => DEFAULT_TASKS)
export class DemoTask extends Table {
  declare _id: string;

  declare name: string;
  declare email: string;
  @Index() declare status:
    | "pending"
    | "in_progress"
    | "completed"
    | "cancelled";
  declare priority: "low" | "medium" | "high";
  @Index() declare due_date: Date;
  declare progress: number;
  declare done: boolean;
  declare description?: string;
  @Index() declare isArchived?: boolean;
}

export class DemoTaskModel extends BasicDataModel(DemoTask, TABLE_NAME) {}
