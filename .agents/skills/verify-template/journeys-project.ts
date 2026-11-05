import {
  equal,
  interrupted,
  refused,
  type Journey,
  type JourneyContext,
} from "@antelopejs/tooling-configs/verify";

import { isNumber, items, pick, text } from "./json.ts";
import {
  call,
  createOwner,
  databases,
  DATABASE,
  demoCollection,
  mongo,
  PASSWORD,
  scaffolded,
  startBackend,
  type Backend,
} from "./project.ts";

const OWNER = "owner@example.com";
const MAPPED = "verify_mapped";
const scaffoldDev: Journey = {
  title:
    "a project scaffolded from the template installs, starts with `ajs project dev --watch` against the run's MongoDB until it prints the onboarding address, and Ctrl+C exits 130 and frees the API port (the pack's `scaffold-dev` with `MONGODB_URL` set, which a DMS needs)",
  entryPoint:
    '`ajs project init --template "DMS Demo"`, `pnpm install`, then `ajs project dev --watch` (what `pnpm dev` runs) with `MONGODB_URL` set as the README\'s optional `.env` does',
  async run(context) {
    const project = await scaffolded(context);
    const backend = await startBackend(context, project);
    const stopped = await context.stop("Ctrl+C", backend.app);
    const after = await context.http(
      "the API after Ctrl+C",
      `${backend.api}/api/system-state`,
    );
    context.expect(stopped.folder, [interrupted(stopped), refused(after)]);
  },
};

async function usersCount(
  context: JourneyContext,
  name: string,
): Promise<number> {
  const read = await mongo(
    context,
    name,
    `db.getCollection("dms-core__users").countDocuments()`,
  );
  return isNumber(read.value) ? read.value : -1;
}

/** The wizard refuses a wrong token and passwords outside the policy, and creates no user for them. */
async function checkRefusedRegistrations(
  context: JourneyContext,
  backend: Backend,
): Promise<void> {
  const before = await call(
    context,
    backend,
    "onboarding state before",
    "/api/onboarding/informations",
  );
  const owner = {
    email: OWNER,
    firstName: "Ada",
    lastName: "Owner",
    setupToken: backend.setupToken,
  };
  const wrongToken = await call(
    context,
    backend,
    "register with a wrong token",
    "/api/onboarding/register",
    {
      body: {
        ...owner,
        password: PASSWORD,
        setupToken: "not-the-printed-token",
      },
    },
  );
  const weak = await call(
    context,
    backend,
    "register with a password without a capital or a special character",
    "/api/onboarding/register",
    { body: { ...owner, password: "verify1pass" } },
  );
  const hash = await call(
    context,
    backend,
    "register with a # as the special character",
    "/api/onboarding/register",
    { body: { ...owner, password: "Verify1#pass" } },
  );
  context.expect(hash.folder, [
    equal(
      "the address the log prints is the dashboard's development origin",
      backend.onboarding,
      "http://localhost:3001",
    ),
    equal(
      "the instance is not onboarded yet",
      pick(before.body, "has_onboarded") ?? null,
      false,
    ),
    equal("a wrong setup token is a 403", wrongToken.status, 403),
    equal("a password outside the policy is a 400", weak.status, 400),
    equal("a # is not a special character of the policy", hash.status, 400),
    equal(
      "no refused request created a user",
      await usersCount(context, "mongosh counts the users"),
      0,
    ),
  ]);
}

/** The printed token creates the owner once; the owner logs in and MongoDB keeps only a hash of the password. */
async function checkOwner(
  context: JourneyContext,
  backend: Backend,
): Promise<void> {
  const owner = {
    email: OWNER,
    firstName: "Ada",
    lastName: "Owner",
    setupToken: backend.setupToken,
  };
  const created = await createOwner(context, backend, OWNER);
  const again = await call(
    context,
    backend,
    "register a second owner",
    "/api/onboarding/register",
    { body: { ...owner, email: "second@example.com", password: PASSWORD } },
  );
  const after = await call(
    context,
    backend,
    "onboarding state after",
    "/api/onboarding/informations",
  );
  const me = await call(
    context,
    backend,
    "the owner's profile",
    "/api/auth/me",
    { token: created.token },
  );
  const anonymous = await call(
    context,
    backend,
    "the profile without a token",
    "/api/auth/me",
  );
  const wrong = await call(
    context,
    backend,
    "log in with a wrong password",
    "/api/auth/login",
    { body: { email: OWNER, password: "Wrong1!pass" } },
  );
  const stored = await mongo(
    context,
    "mongosh reads the owner",
    `db.getCollection("dms-core__users").find().toArray()`,
  );
  context.expect(stored.folder, [
    equal("a second owner is a 400", again.status, 400),
    equal(
      "the instance is onboarded",
      pick(after.body, "has_onboarded") ?? null,
      true,
    ),
    equal(
      "the token opens the owner's profile",
      [
        me.status,
        pick(me.body, "email") ?? null,
        pick(me.body, "owner") ?? null,
      ],
      [200, OWNER, true],
    ),
    equal("the profile without a token is a 401", anonymous.status, 401),
    equal("a wrong password is a 401", wrong.status, 401),
    equal(
      "MongoDB holds the one owner, without the password in clear",
      [
        items(stored.value).length,
        pick(stored.value, 0, "email") ?? null,
        JSON.stringify(stored.value).includes(PASSWORD),
      ],
      [1, OWNER, false],
    ),
  ]);
}

const onboarding: Journey = {
  title:
    "the first start prints the README's onboarding address on the dashboard's origin; the wizard refuses a wrong setup token and passwords outside the README's policy, creates the owner once with the printed token, and the owner logs in",
  entryPoint:
    "the `[DMS] No owner exists yet` line of `pnpm dev`, then `/api/onboarding/register`, `/api/auth/login` and `/api/auth/me`, which the dashboard's wizard and login screen call",
  async run(context) {
    const project = await scaffolded(context);
    const backend = await startBackend(context, project);
    await checkRefusedRegistrations(context, backend);
    await checkOwner(context, backend);
  },
};

const COLLECTIONS = "db.getCollectionNames().sort()";

const databaseMapping: Journey = {
  title:
    "with only `MONGODB_URL` set, the DMS and Helio write every collection into the `template_dms_demo` database the README names and no other; with `MONGODB_DATABASE` set, the next start writes into that database and leaves the default one as it was",
  entryPoint:
    "`pnpm dev` with `MONGODB_URL`, then again with `MONGODB_DATABASE`, the variables the README's Environment table maps",
  async run(context) {
    const project = await scaffolded(context);
    const first = await startBackend(context, project, {
      env: { HELIO_SIMULATORS: "off" },
    });
    const created = await databases(context, "mongosh lists the databases");
    const written = await mongo(
      context,
      `mongosh lists the collections of ${DATABASE}`,
      COLLECTIONS,
    );
    const names = items(written.value).map((name) => text(name));
    context.expect(written.folder, [
      equal(
        "the only database the start created is the default one",
        created.names,
        [DATABASE],
      ),
      equal(
        "the DMS users and Helio customers are in it",
        ["dms-core__users", demoCollection("helio_customers")].filter(
          (name) => !names.includes(name),
        ),
        [],
      ),
    ]);
    const stopped = await context.stop("Ctrl+C", first.app);
    context.expect(stopped.folder, [interrupted(stopped)], { critical: true });
    await startBackend(context, project, {
      env: { HELIO_SIMULATORS: "off", MONGODB_DATABASE: MAPPED },
    });
    const both = await databases(context, "mongosh lists the databases again");
    const mapped = await mongo(
      context,
      `mongosh lists the collections of ${MAPPED}`,
      COLLECTIONS,
      MAPPED,
    );
    const kept = await mongo(
      context,
      `mongosh lists the collections of ${DATABASE} again`,
      COLLECTIONS,
    );
    context.expect(kept.folder, [
      equal("the second start created the configured database", both.names, [
        DATABASE,
        MAPPED,
      ]),
      equal(
        "it holds the same collections as the default one",
        mapped.value,
        written.value,
      ),
      equal(
        "the default database kept its collections",
        kept.value,
        written.value,
      ),
    ]);
  },
};

export const projectJourneys = {
  "scaffold-dev": scaffoldDev,
  onboarding,
  "database-mapping": databaseMapping,
};
