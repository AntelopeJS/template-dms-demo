import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  equal,
  exitIs,
  has,
  type Journey,
  type JourneyContext,
} from "@antelopejs/tooling-configs/verify";

import { pick, text } from "./json.ts";
import {
  alive,
  call,
  createOwner,
  freePort,
  logOf,
  mongoUrl,
  ONBOARDING_LINE,
  scaffolded,
  sleep,
  startDetached,
  stopDetached,
  waitForApi,
  type Detached,
} from "./project.ts";

const OWNER = "owner@example.com";
const PRODUCTION = {
  JWT_SECRET: "verify-jwt-secret-0123456789abcdef",
  DMS_HTML_RENDER_SECRET: "verify-render-secret-0123456789ab",
  DMS_CLIENT_BASE_URL: "https://dashboard.example.com",
  DMS_API_PUBLIC_BASE_URL: "https://api.example.com",
  SMTP_HOST: "127.0.0.1",
};
const START_ATTEMPTS = 180;
type Secret = keyof typeof PRODUCTION;
const REQUIRED: Secret[] = [
  "JWT_SECRET",
  "DMS_HTML_RENDER_SECRET",
  "DMS_CLIENT_BASE_URL",
];

/** Points the API of the scaffolded project at a free port: `ajs project start` does not fall back to the next free port as `pnpm dev` does. */
function onPort(context: JourneyContext, project: string, port: number): void {
  const file = join(project, "antelope.config.ts");
  context.edit(
    "point the API at a free port",
    file,
    readFileSync(file, "utf8").replace("port: 5010 }", `port: ${port} }`),
  );
}

/** Builds the project for production in `env`: `ajs project build` freezes the values `envOverrides` reads into `.antelope/build/build.json`. */
async function productionBuild(
  context: JourneyContext,
  project: string,
  name: string,
  env: Record<string, string>,
): Promise<void> {
  const build = await context.command(
    `ajs project build -e production ${name}`,
    "pnpm",
    ["exec", "ajs", "project", "build", "-e", "production"],
    { cwd: project, env },
  );
  context.expect(build.folder, [exitIs(build, 0)], { critical: true });
}

async function refusedWithout(
  context: JourneyContext,
  project: string,
  base: Record<string, string>,
  missing: Secret,
): Promise<void> {
  const env = {
    ...base,
    ...Object.fromEntries(
      Object.entries(PRODUCTION).filter(([name]) => name !== missing),
    ),
  };
  await productionBuild(context, project, `without ${missing}`, env);
  const run = await context.command(
    `ajs project start -e production without ${missing}`,
    "pnpm",
    ["exec", "ajs", "project", "start", "-e", "production"],
    { cwd: project, env, timeoutMs: 180_000 },
  );
  context.expect(run.folder, [
    equal("the start fails", run.exitCode !== 0 && run.exitCode !== null, true),
    has(
      `and names ${missing}`,
      run.stdout + run.stderr,
      new RegExp(`\\[DMS\\][^\\n]*${missing}`),
    ),
  ]);
}

async function waitForOnboarding(
  context: JourneyContext,
  server: Detached,
): Promise<RegExpExecArray | null> {
  let line = ONBOARDING_LINE.exec(logOf(server));
  for (
    let attempt = 1;
    attempt < START_ATTEMPTS && line === null && alive(server.pid);
    attempt += 1
  ) {
    await sleep(1000);
    line = ONBOARDING_LINE.exec(logOf(server));
  }
  return line;
}

const productionEnv: Journey = {
  title:
    "`ajs project build -e production` then `ajs project start -e production` refuse to start while `JWT_SECRET`, `DMS_HTML_RENDER_SECRET` or `DMS_CLIENT_BASE_URL` is unset and name the one missing; with all three the backend starts, prints the onboarding address on the `DMS_CLIENT_BASE_URL` origin, and a token signed with `JWT_SECRET` opens the API",
  entryPoint:
    "`ajs project build -e production` and `ajs project start -e production`, with the variables the README's Environment table marks required with `-e production`",
  async run(context) {
    const project = await scaffolded(context);
    const port = await freePort();
    onPort(context, project, port);
    const base = { MONGODB_URL: mongoUrl(context), HELIO_SIMULATORS: "off" };
    for (const missing of REQUIRED)
      await refusedWithout(context, project, base, missing);
    const env = { ...base, ...PRODUCTION };
    await productionBuild(context, project, "with every variable", env);
    const server = await startDetached(
      context,
      "ajs project start -e production",
      project,
      "pnpm exec ajs project start -e production",
      env,
    );
    try {
      const line = await waitForOnboarding(context, server);
      context.expect(
        context.tree("project after the start", project).folder,
        [equal("the log prints the onboarding address", line !== null, true)],
        { critical: true },
      );
      const backend = {
        api: `http://127.0.0.1:${port}`,
        onboarding: line?.[1] ?? "",
        setupToken: line?.[2] ?? "",
      };
      await waitForApi(context, backend.api);
      const owner = await createOwner(context, backend, OWNER);
      const me = await call(
        context,
        backend,
        "the owner's profile",
        "/api/auth/me",
        { token: owner.token },
      );
      context.expect(me.folder, [
        equal(
          "the onboarding address is on the configured dashboard origin",
          backend.onboarding,
          PRODUCTION.DMS_CLIENT_BASE_URL,
        ),
        equal(
          "the token signed with JWT_SECRET opens the profile",
          [me.status, text(pick(me.body, "email"))],
          [200, OWNER],
        ),
        equal(
          "the log does not print the JWT secret",
          logOf(server).includes(PRODUCTION.JWT_SECRET),
          false,
        ),
      ]);
    } finally {
      await stopDetached(context, server, "the production backend");
    }
  },
};

async function dockerAvailable(context: JourneyContext): Promise<void> {
  const info = await context.command("docker info", "docker", [
    "info",
    "--format",
    "{{.ServerVersion}}",
  ]);
  if (info.exitCode !== 0)
    context.notVerified(
      `docker does not answer: ${info.stderr.trim().slice(0, 200)}`,
    );
}

const frontendImage: Journey = {
  title:
    "`frontend.Dockerfile` builds the dashboard image from a clean clone of the project, and the image's command is the installed `ajs-dms start`, which refuses to start without the backend URL",
  entryPoint:
    "`docker build -f frontend.Dockerfile .` in a `git clone` of the committed project, as `ajs-cloud link --dockerfile frontend=frontend.Dockerfile` deploys it",
  async run(context) {
    await dockerAvailable(context);
    const project = await scaffolded(context);
    const commit = await context.command(
      "commit the project",
      "sh",
      [
        "-c",
        "git add -A && git -c user.name=verify -c user.email=verify@example.invalid commit -q -m initial",
      ],
      { cwd: project },
    );
    context.expect(commit.folder, [exitIs(commit, 0)], { critical: true });
    const clone = join(context.work, "clone");
    const cloned = await context.command("git clone", "git", [
      "clone",
      "-q",
      project,
      clone,
    ]);
    context.expect(cloned.folder, [exitIs(cloned, 0)], { critical: true });
    const tag = `verify-template-dms-demo-frontend:${Date.now().toString(36)}`;
    try {
      const build = await context.command(
        "docker build",
        "docker",
        [
          "build",
          "-q",
          "-f",
          "frontend.Dockerfile",
          "--output",
          `type=image,name=${tag},compression=uncompressed,force-compression=true`,
          ".",
        ],
        { cwd: clone, timeoutMs: 1_200_000 },
      );
      context.expect(build.folder, [exitIs(build, 0)], { critical: true });
      const config = await context.command(
        "the image's command and user",
        "docker",
        [
          "image",
          "inspect",
          "--format",
          "{{json .Config.Cmd}} {{.Config.User}}",
          tag,
        ],
      );
      const started = await context.command(
        "run the image without its environment",
        "docker",
        ["run", "--rm", tag],
        { timeoutMs: 120_000 },
      );
      context.expect(started.folder, [
        equal(
          "the image runs the installed ajs-dms start as node",
          config.stdout.trim(),
          '["/app/node_modules/.bin/ajs-dms","start"] node',
        ),
        equal(
          "the server refuses to start without its environment",
          started.exitCode !== 0 && started.exitCode !== null,
          true,
        ),
        has(
          "and names the backend URL it needs",
          started.stdout + started.stderr,
          /DMS_API_BASE_URL/,
        ),
      ]);
    } finally {
      await context.command("remove the image", "docker", [
        "image",
        "rm",
        "-f",
        tag,
      ]);
    }
  },
};

export const deployJourneys = {
  "production-env": productionEnv,
  "frontend-image": frontendImage,
};
