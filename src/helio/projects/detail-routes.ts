import {
  Controller,
  Get,
  HTTPResult,
  Parameter,
  Post,
} from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { tableViewRowTopic } from "@antelopejs/interface-dms/base/table-view";
import type { ConfirmDialog } from "@antelopejs/interface-dms/base/types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { logProjectStatus } from "./activity-log";
import { projectActivity } from "./detail-activity";
import {
  addressLine,
  countTasks,
  loadBundle,
  loadInvoices,
  loadProject,
  loadQuote,
  loadTasks,
} from "./detail-data";
import {
  customerContact,
  invoicingMeter,
  projectBanner,
  projectFacts,
  projectStats,
  taskMeter,
} from "./detail-facts";
import { PageHelioProject } from "./detail-page";
import { quoteFacts, quoteLines } from "./detail-quote";
import { ProjectModel, ProjectTaskModel } from "./database";
import { directionsUrl, PROJECT_DETAIL_API } from "./links";
import { PageHelioProjects } from "./list-page";
import { PROJECTS_LOCATION, TASKS_LOCATION } from "./topics";

// A project can be closed once work started on site, and only once.
const CLOSABLE_STATUSES = new Set(["in_progress", "inspection", "on_hold"]);

// Marking a project done changes it like an edit from its table: only who
// may edit projects may do it.
const editProjects =
  PageHelioProjects.table.getAction("edit") ?? PageHelioProjects;

// Tell the tables and blocks watching projects and tasks that rows changed
// outside their data routes, so they read them again.
async function announceChanges(projectId: string, taskIds: string[]) {
  await PublishMessage(tableViewRowTopic(PROJECTS_LOCATION), "updated", {
    payload: { ids: [projectId] },
  });
  if (taskIds.length > 0) {
    await PublishMessage(tableViewRowTopic(TASKS_LOCATION), "updated", {
      payload: { ids: taskIds },
    });
  }
}

// A page that only forwards the browser to `url` (HTML-escaped for the
// attribute and the script string).
function redirectPage(url: string): string {
  const attribute = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${attribute}"><script>location.replace(${JSON.stringify(url)})</script>`;
}

/**
 * The routes of the project detail page, all scoped by the project `_id`
 * the page reads from its URL (`{{params.id}}`). Each answers 404 for an
 * unknown project, which the page's Guard turns into its "not found" state.
 */
export class HelioProjectDetailApi extends Controller(PROJECT_DETAIL_API) {
  @Get(":id")
  async summary(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    const project = await loadProject(id);
    return { _id: project._id, code: project.code, name: project.name };
  }

  @Get(":id/stats")
  async stats(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    return { items: projectStats(await loadBundle(id)) };
  }

  @Get(":id/banner")
  async banner(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    return projectBanner(await loadBundle(id));
  }

  @Get(":id/facts")
  async facts(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    return { items: projectFacts(await loadBundle(id)) };
  }

  @Get(":id/contact")
  async contact(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    return { items: customerContact(await loadBundle(id)) };
  }

  @Get(":id/progress")
  async progress(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    return taskMeter(await loadBundle(id));
  }

  @Get(":id/invoicing")
  async invoicing(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    return invoicingMeter(await loadBundle(id));
  }

  // The tab counters: tasks, history entries and invoices.
  @Get(":id/badges")
  async badges(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    const bundle = await loadBundle(id);
    const activity = await projectActivity(bundle);
    return {
      tasks: bundle.tasks.length,
      activity: activity.count,
      invoices: bundle.invoices.length,
      quote: bundle.quote ? bundle.quote.lines.length : 0,
    };
  }

  @Get(":id/activity")
  async activity(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    return projectActivity(await loadBundle(id));
  }

  @Get(":id/quote")
  async quote(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    const project = await loadProject(id);
    return { items: quoteFacts(await loadQuote(project.quote)) };
  }

  // The lines of the signed quote, for a read-only source table.
  @Get(":id/quote-lines")
  async quoteLines(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    const project = await loadProject(id);
    const results = quoteLines(await loadQuote(project.quote));
    return { results, total: results.length };
  }

  // The "Route" header button opens this in a new tab: the address is only
  // known here. The page sends the browser on to Google Maps itself, since
  // the DMS frontend proxy follows a 302 server-side instead of relaying it.
  @Get(":id/directions")
  async directions(
    @AuthUserWithPermission(PageHelioProject) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    const project = await loadProject(id);
    return new HTTPResult(
      200,
      redirectPage(directionsUrl(addressLine(project))),
      "text/html; charset=utf-8",
    );
  }

  // The dialog "Mark as done" asks in, worded for this project: what it
  // closes, or why it cannot run.
  @Get(":id/done-confirm")
  async doneConfirm(
    @AuthUserWithPermission(editProjects) _user: User,
    @Parameter("id", "param") id: string,
  ): Promise<ConfirmDialog> {
    const project = await loadProject(id);
    const params = { code: project.code, name: project.name };
    if (project.status === "done") {
      return {
        title: "$helio.projects.detail.done.alreadyTitle",
        description: "$helio.projects.detail.done.alreadyDescription",
        params,
        icon: "i-ph-check-circle",
        blocked: true,
      };
    }
    if (project.status === "planned" || project.status === "scheduled") {
      return {
        title: "$helio.projects.detail.done.notStartedTitle",
        description: "$helio.projects.detail.done.notStartedDescription",
        params,
        icon: "i-ph-calendar-x",
        blocked: true,
      };
    }
    const counts = countTasks(await loadTasks(id));
    const unpaid = (await loadInvoices(id)).filter(
      (invoice) => invoice.amountDue > 0,
    ).length;
    return {
      title: "$helio.projects.detail.done.title",
      description: "$helio.projects.detail.done.description",
      params,
      icon: "i-ph-check-circle",
      color: "success",
      confirmLabel: "$helio.projects.detail.done.confirm",
      impact: [
        {
          icon: "i-ph-list-checks",
          label: "$helio.projects.detail.done.impactTasks",
          count: counts.todo + counts.doing,
        },
        {
          icon: "i-ph-calendar-check",
          label: "$helio.projects.detail.done.impactEnd",
        },
        {
          icon: "i-ph-receipt",
          label: "$helio.projects.detail.done.impactInvoices",
          count: unpaid,
        },
      ],
    };
  }

  // Closes the project: its open tasks are done and its end date becomes
  // today, the day the installation was handed over.
  @Post(":id/done")
  async markDone(
    @AuthUserWithPermission(editProjects) _user: User,
    @Parameter("id", "param") id: string,
  ) {
    const project = await loadProject(id);
    if (!CLOSABLE_STATUSES.has(project.status)) {
      throw new HTTPResult(409, {
        message: "$helio.projects.detail.done.refused",
      });
    }
    const open = (await loadTasks(id)).filter((task) => task.status !== "done");
    const tasks = GetModel(ProjectTaskModel);
    await Promise.all(
      open.map((task) => tasks.update(task._id, { status: "done" })),
    );
    await GetModel(ProjectModel).update(id, {
      status: "done",
      plannedEnd: new Date(),
    });
    await announceChanges(
      id,
      open.map((task) => task._id),
    );
    await logProjectStatus(id, "done");
    return { ok: true };
  }
}
