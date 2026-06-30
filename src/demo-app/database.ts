import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs-private/cms/interfaces/cms/constants";
import { Relation } from "@antelopejs-private/cms-database/interfaces/cms-database";

const USERS_TABLE = "demo_app_users";
const PROJECTS_TABLE = "demo_app_projects";
const TASKS_TABLE = "demo_app_tasks";

const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

// Fixtures are inserted by RegisterSchema(CORE_SCHEMA_NAME) during the cms
// module start(), only when the collection is still empty. Drop the
// demo_app_* collections (or the whole database) to re-seed.

const DEFAULT_USERS: Array<Partial<AppUser>> = [
  {
    _id: "user-alice",
    name: "Alice Martin",
    email: "alice.martin@example.com",
    phone: "+32 470 11 22 33",
    role: "admin",
    avatar: "https://i.pravatar.cc/150?u=alice",
    isActive: true,
    hiredAt: daysFromNow(-420),
  },
  {
    _id: "user-bob",
    name: "Bob Dupont",
    email: "bob.dupont@example.com",
    phone: "+32 471 22 33 44",
    role: "manager",
    avatar: "https://i.pravatar.cc/150?u=bob",
    isActive: true,
    hiredAt: daysFromNow(-300),
  },
  {
    _id: "user-carol",
    name: "Carol Lambert",
    email: "carol.lambert@example.com",
    phone: "+33 6 12 34 56 78",
    role: "member",
    avatar: "https://i.pravatar.cc/150?u=carol",
    isActive: true,
    hiredAt: daysFromNow(-180),
  },
  {
    _id: "user-dave",
    name: "Dave Janssens",
    email: "dave.janssens@example.com",
    phone: "+32 472 33 44 55",
    role: "member",
    avatar: "https://i.pravatar.cc/150?u=dave",
    isActive: false,
    hiredAt: daysFromNow(-600),
  },
  {
    _id: "user-emma",
    name: "Emma Petit",
    email: "emma.petit@example.com",
    phone: "+33 6 98 76 54 32",
    role: "manager",
    avatar: "https://i.pravatar.cc/150?u=emma",
    isActive: true,
    hiredAt: daysFromNow(-250),
  },
  {
    _id: "user-felix",
    name: "Félix Moreau",
    email: "felix.moreau@example.com",
    phone: "+33 7 11 22 33 44",
    role: "member",
    avatar: "https://i.pravatar.cc/150?u=felix",
    isActive: true,
    hiredAt: daysFromNow(-90),
  },
  {
    _id: "user-grace",
    name: "Grace Vandenberg",
    email: "grace.vandenberg@example.com",
    phone: "+32 473 44 55 66",
    role: "member",
    avatar: "https://i.pravatar.cc/150?u=grace",
    isActive: true,
    hiredAt: daysFromNow(-45),
  },
  {
    _id: "user-hugo",
    name: "Hugo Lefèvre",
    email: "hugo.lefevre@example.com",
    role: "member",
    avatar: "https://i.pravatar.cc/150?u=hugo",
    isActive: false,
    hiredAt: daysFromNow(-700),
  },
];

const DEFAULT_PROJECTS: Array<Partial<AppProject>> = [
  {
    _id: "project-website",
    name: "Website redesign",
    description:
      "Full redesign of the marketing website: new branding, new content structure and a Lighthouse score above 95.",
    status: "active",
    startDate: daysFromNow(-45),
    endDate: daysFromNow(30),
    budget: 25000,
    progress: 0.55,
  },
  {
    _id: "project-mobile",
    name: "Mobile application",
    description:
      "iOS and Android companion app with offline mode and push notifications.",
    status: "planned",
    startDate: daysFromNow(15),
    endDate: daysFromNow(120),
    budget: 60000,
    progress: 0,
  },
  {
    _id: "project-crm",
    name: "CRM migration",
    description:
      "Migrate the legacy CRM to the new platform without losing a single customer record.",
    status: "on_hold",
    startDate: daysFromNow(-90),
    endDate: daysFromNow(60),
    budget: 40000,
    progress: 0.2,
  },
  {
    _id: "project-infra",
    name: "Infrastructure upgrade",
    description:
      "Move all workloads to the new Kubernetes cluster and decommission the old servers.",
    status: "completed",
    startDate: daysFromNow(-200),
    endDate: daysFromNow(-20),
    budget: 18000,
    progress: 1,
  },
  {
    _id: "project-design-system",
    name: "Design system",
    description:
      "Build a shared component library and design tokens used by every product team.",
    status: "active",
    startDate: daysFromNow(-30),
    endDate: daysFromNow(90),
    budget: 32000,
    progress: 0.3,
  },
  {
    _id: "project-newsletter",
    name: "Newsletter revamp",
    description:
      "New template, better segmentation and automated campaigns. Cancelled after the Q2 budget review.",
    status: "on_hold",
    startDate: daysFromNow(-120),
    endDate: daysFromNow(-60),
    budget: 8000,
    progress: 0.15,
    isArchived: true,
  },
];

const DEFAULT_TASKS: Array<Partial<AppTask>> = [
  // Website redesign
  {
    name: "Design the new homepage",
    description:
      "Hero section, social proof band and a clear call to action above the fold.",
    status: "in_progress",
    priority: "high",
    project: "project-website",
    assignee: "user-carol",
    dueDate: daysFromNow(5),
    estimateHours: 24,
    progress: 0.6,
    done: false,
  },
  {
    name: "Write the content migration script",
    description: "Map the old CMS entries to the new content model.",
    status: "pending",
    priority: "medium",
    project: "project-website",
    assignee: "user-bob",
    dueDate: daysFromNow(12),
    estimateHours: 16,
    progress: 0,
    done: false,
  },
  {
    name: "Set up the staging environment",
    description: "Same topology as production, seeded with anonymized data.",
    status: "completed",
    priority: "high",
    project: "project-website",
    assignee: "user-carol",
    dueDate: daysFromNow(-10),
    estimateHours: 6,
    progress: 1,
    done: true,
  },
  {
    name: "SEO audit of the current pages",
    description: "Crawl the site, list broken links and missing metadata.",
    status: "completed",
    priority: "medium",
    project: "project-website",
    assignee: "user-emma",
    dueDate: daysFromNow(-18),
    estimateHours: 10,
    progress: 1,
    done: true,
  },
  {
    name: "Accessibility review",
    description: "WCAG 2.2 AA pass on the new templates.",
    status: "pending",
    priority: "medium",
    project: "project-website",
    assignee: "user-grace",
    dueDate: daysFromNow(18),
    estimateHours: 12,
    progress: 0,
    done: false,
  },
  // Mobile application
  {
    name: "Define the mobile app scope",
    description: "Feature list for the MVP, validated with the product team.",
    status: "pending",
    priority: "high",
    project: "project-mobile",
    assignee: "user-alice",
    dueDate: daysFromNow(20),
    estimateHours: 8,
    progress: 0,
    done: false,
  },
  {
    name: "Choose the push notification provider",
    description: "Compare pricing and delivery rates of the main providers.",
    status: "pending",
    priority: "low",
    project: "project-mobile",
    assignee: "user-felix",
    dueDate: daysFromNow(35),
    estimateHours: 4,
    progress: 0,
    done: false,
  },
  {
    name: "Prototype the offline mode",
    description: "Local cache, sync queue and conflict resolution strategy.",
    status: "pending",
    priority: "medium",
    project: "project-mobile",
    assignee: "user-felix",
    dueDate: daysFromNow(45),
    estimateHours: 40,
    progress: 0,
    done: false,
  },
  // CRM migration
  {
    name: "Audit the legacy CRM data",
    description: "Quantify duplicates, dead contacts and missing fields.",
    status: "in_progress",
    priority: "medium",
    project: "project-crm",
    assignee: "user-bob",
    dueDate: daysFromNow(8),
    estimateHours: 32,
    progress: 0.35,
    done: false,
  },
  {
    name: "Write the deduplication rules",
    description: "Match on email first, then on name + company.",
    status: "pending",
    priority: "high",
    project: "project-crm",
    assignee: "user-emma",
    dueDate: daysFromNow(15),
    estimateHours: 20,
    progress: 0,
    done: false,
  },
  {
    name: "Plan the CRM training sessions",
    description: "Cancelled: the rollout is postponed to next quarter.",
    status: "cancelled",
    priority: "low",
    project: "project-crm",
    assignee: "user-alice",
    dueDate: daysFromNow(-5),
    estimateHours: 4,
    progress: 0.1,
    done: false,
    isArchived: true,
  },
  // Infrastructure upgrade
  {
    name: "Decommission the old servers",
    description: "Backups archived, DNS switched, machines returned.",
    status: "completed",
    priority: "low",
    project: "project-infra",
    assignee: "user-dave",
    dueDate: daysFromNow(-25),
    estimateHours: 12,
    progress: 1,
    done: true,
  },
  {
    name: "Migrate the CI runners",
    description: "Move the build agents to the new cluster node pool.",
    status: "completed",
    priority: "medium",
    project: "project-infra",
    assignee: "user-dave",
    dueDate: daysFromNow(-40),
    estimateHours: 8,
    progress: 1,
    done: true,
  },
  {
    name: "Write the incident runbook",
    description: "On-call procedures for the new infrastructure.",
    status: "completed",
    priority: "high",
    project: "project-infra",
    assignee: "user-bob",
    dueDate: daysFromNow(-30),
    estimateHours: 6,
    progress: 1,
    done: true,
  },
  // Design system
  {
    name: "Inventory the existing components",
    description: "Screenshot and classify every UI pattern currently in use.",
    status: "completed",
    priority: "medium",
    project: "project-design-system",
    assignee: "user-grace",
    dueDate: daysFromNow(-8),
    estimateHours: 14,
    progress: 1,
    done: true,
  },
  {
    name: "Define the design tokens",
    description: "Colors, spacing, typography and elevation scales.",
    status: "in_progress",
    priority: "high",
    project: "project-design-system",
    assignee: "user-carol",
    dueDate: daysFromNow(7),
    estimateHours: 18,
    progress: 0.45,
    done: false,
  },
  {
    name: "Build the button and input components",
    description: "First two components shipped with full documentation.",
    status: "in_progress",
    priority: "medium",
    project: "project-design-system",
    assignee: "user-grace",
    dueDate: daysFromNow(14),
    estimateHours: 24,
    progress: 0.25,
    done: false,
  },
  {
    name: "Set up visual regression tests",
    description: "Chromatic-style snapshots on every pull request.",
    status: "pending",
    priority: "low",
    project: "project-design-system",
    assignee: "user-felix",
    dueDate: daysFromNow(28),
    estimateHours: 10,
    progress: 0,
    done: false,
  },
  // Newsletter revamp (archived project)
  {
    name: "Design the new email template",
    description: "Put on hold together with the project.",
    status: "cancelled",
    priority: "medium",
    project: "project-newsletter",
    assignee: "user-emma",
    dueDate: daysFromNow(-70),
    estimateHours: 12,
    progress: 0.2,
    done: false,
    isArchived: true,
  },
  {
    name: "Segment the subscriber base",
    description: "Put on hold together with the project.",
    status: "cancelled",
    priority: "low",
    project: "project-newsletter",
    assignee: "user-hugo",
    dueDate: daysFromNow(-65),
    estimateHours: 8,
    progress: 0,
    done: false,
    isArchived: true,
  },
];

@RegisterTable(USERS_TABLE, CORE_SCHEMA_NAME)
@Fixture(() => DEFAULT_USERS)
export class AppUser extends Table {
  @Field("string") declare _id: string;

  @Index() @Field("string") declare name: string;
  @Field("string") declare email: string;
  @Field("string") declare phone?: string;
  @Index() @Field("string") declare role: "admin" | "manager" | "member";
  @Field("string") declare avatar?: string;
  @Index() @Field("boolean") declare isActive: boolean;
  @Index() @Field("date") declare hiredAt: Date;
}

export class AppUserModel extends BasicDataModel(AppUser, USERS_TABLE) {}

@RegisterTable(PROJECTS_TABLE, CORE_SCHEMA_NAME)
@Fixture(() => DEFAULT_PROJECTS)
export class AppProject extends Table {
  @Field("string") declare _id: string;

  @Index() @Field("string") declare name: string;
  @Field("string") declare description?: string;
  @Index() @Field("string") declare status:
    | "planned"
    | "active"
    | "on_hold"
    | "completed";
  @Index() @Field("date") declare startDate: Date;
  @Field("date") declare endDate: Date;
  @Field("number") declare budget: number;
  @Field("number") declare progress: number;
  @Index() @Field("boolean") declare isArchived?: boolean;
}

export class AppProjectModel extends BasicDataModel(
  AppProject,
  PROJECTS_TABLE,
) {}

@RegisterTable(TASKS_TABLE, CORE_SCHEMA_NAME)
@Fixture(() => DEFAULT_TASKS)
export class AppTask extends Table {
  @Field("string") declare _id: string;

  @Index() @Field("string") declare name: string;
  @Field("string") declare description?: string;
  @Index() @Field("string") declare status:
    | "pending"
    | "in_progress"
    | "completed"
    | "cancelled";
  @Field("string") declare priority: "low" | "medium" | "high";
  @Index() @Field("string") @Relation({ to: () => AppProject })
  declare project: string;
  @Index() @Field("string") @Relation({ to: () => AppUser })
  declare assignee: string;
  @Index() @Field("date") declare dueDate: Date;
  @Field("number") declare estimateHours: number;
  @Field("number") declare progress: number;
  @Field("boolean") declare done: boolean;
  @Index() @Field("boolean") declare isArchived?: boolean;
}

export class AppTaskModel extends BasicDataModel(AppTask, TASKS_TABLE) {}
