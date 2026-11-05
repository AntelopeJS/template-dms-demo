import { join } from "node:path";

import {
  equal,
  exitIs,
  has,
  lacks,
  refused,
  type HttpResult,
  type Journey,
  type JourneyContext,
} from "@antelopejs/tooling-configs/verify";

import {
  alive,
  freePort,
  scaffolded,
  sleep,
  startBackend,
  startDetached,
  stopDetached,
} from "./project.ts";

const DASHBOARD_ATTEMPTS = 240;
const POLL_MS = 1000;

const frontendChecks: Journey = {
  title:
    "the frontend module's own lint (locales and ESLint) and Vitest suite pass in the scaffolded project, and a failing test added to it fails the suite",
  entryPoint:
    "`pnpm --dir frontend-vue lint` and `pnpm --dir frontend-vue test`, as the README tells the user to run the frontend checks",
  async run(context) {
    const project = await scaffolded(context);
    const lint = await context.command(
      "pnpm --dir frontend-vue lint",
      "pnpm",
      ["--dir", "frontend-vue", "lint"],
      { cwd: project },
    );
    const test = await context.command(
      "pnpm --dir frontend-vue test",
      "pnpm",
      ["--dir", "frontend-vue", "test"],
      { cwd: project },
    );
    context.expect(test.folder, [
      exitIs(lint, 0),
      exitIs(test, 0),
      has("Vitest ran the test files", test.stdout, /Test Files\s+\d+ passed/),
      lacks("no test failed", test.stdout, /failed/),
    ]);
    context.edit(
      "add a failing test",
      join(project, "frontend-vue", "tests", "verify-broken.test.ts"),
      "import { expect, test } from 'vitest'\n\ntest('verify-broken', () => {\n\texpect(1).toBe(2)\n})\n",
    );
    const broken = await context.command(
      "pnpm --dir frontend-vue test with the failing test",
      "pnpm",
      ["--dir", "frontend-vue", "test"],
      { cwd: project },
    );
    context.expect(broken.folder, [
      equal(
        "the suite fails",
        broken.exitCode !== 0 && broken.exitCode !== null,
        true,
      ),
      has(
        "and names the failing test",
        broken.stdout + broken.stderr,
        /verify-broken/,
      ),
    ]);
  },
};

const frontendVerify: Journey = {
  title:
    "`pnpm frontend:verify` builds and type-checks `frontend-vue` against the installed `@antelopejs/dms-frontend` and `@antelopejs/dms`, without a backend",
  entryPoint: "`pnpm frontend:verify` in the scaffolded project",
  async run(context) {
    const project = await scaffolded(context);
    const verify = await context.command(
      "pnpm frontend:verify",
      "pnpm",
      ["frontend:verify"],
      { cwd: project, timeoutMs: 600_000 },
    );
    context.expect(verify.folder, [exitIs(verify, 0)]);
  },
};

async function waitForPage(
  context: JourneyContext,
  url: string,
  pid: number,
): Promise<HttpResult> {
  let page = await context.http("the dashboard answers", url);
  for (
    let attempt = 1;
    attempt < DASHBOARD_ATTEMPTS && page.status !== 200 && alive(pid);
    attempt += 1
  ) {
    await sleep(POLL_MS);
    page = await context.http("the dashboard answers", url);
  }
  return page;
}

const dashboardDev: Journey = {
  title:
    "with the backend running, `pnpm frontend:dev` discovers it through `.antelope/dev.json` and serves the onboarding address the backend printed, and proxies the API to it",
  entryPoint:
    "`pnpm dev`, then `pnpm frontend:dev` in a second terminal, then the `/onboarding?token=…` address of the log, as the README's Getting started says",
  async run(context) {
    const project = await scaffolded(context);
    const backend = await startBackend(context, project);
    const port = await freePort();
    const dashboard = await startDetached(
      context,
      "pnpm frontend:dev",
      project,
      "pnpm frontend:dev",
      { PORT: String(port) },
    );
    const origin = `http://127.0.0.1:${port}`;
    try {
      const page = await waitForPage(
        context,
        `${origin}/onboarding?token=${backend.setupToken}`,
        dashboard.pid,
      );
      const direct = await context.http(
        "the backend's system state",
        `${backend.api}/api/system-state`,
      );
      const proxied = await context.http(
        "the system state through the dashboard",
        `${origin}/api/system-state`,
      );
      context.expect(proxied.folder, [
        equal("the onboarding address answers 200", page.status, 200),
        has("with an HTML page", page.body, /<html/i),
        equal(
          "the dashboard proxies the API to the backend it discovered",
          [proxied.status, proxied.json ?? null],
          [200, direct.json ?? null],
        ),
      ]);
    } finally {
      await stopDetached(context, dashboard, "the dashboard");
      const after = await context.http(
        "the dashboard after the stop",
        `${origin}/`,
      );
      context.expect(after.folder, [refused(after)]);
    }
  },
};

export const frontendJourneys = {
  "frontend-checks": frontendChecks,
  "frontend-verify": frontendVerify,
  "dashboard-dev": dashboardDev,
};
