import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  equal,
  interrupted,
  type Journey,
  type JourneyContext,
} from "@antelopejs/tooling-configs/verify";

import { items, keys, pick, text, type Json } from "./json.ts";
import {
  call,
  createOwner,
  demoCollection,
  mongo,
  scaffolded,
  sleep,
  startBackend,
  type Backend,
  type Owner,
} from "./project.ts";

const HOME = "/dms/pages/home";
const CUSTOMERS = demoCollection("helio_customers");
const FIGURES = ["pages", "collections", "controllers", "vue", "modules"];
const SIMULATORS_OFF = { HELIO_SIMULATORS: "off" };
const NEW_CUSTOMER = {
  name: "Verify Solar SRL",
  kind: "business",
  contactName: "Grace Verify",
  email: "grace@verify-solar.example",
  phone: "+32 2 000 00 00",
  address: {
    streetName: "Rue de la Loi",
    houseNumber: "16",
    postalCode: "1000",
    city: "Bruxelles",
    countryCode: "BE",
  },
  segments: [],
  source: "website",
  isVip: false,
};

/** The section ids `content/home/` holds Markdown for, each in English and French. */
function contentSections(project: string): string[] {
  const files = readdirSync(join(project, "content", "home"));
  return [...new Set(files.map((file) => file.split(".")[0] ?? ""))].sort();
}

function markdownOf(project: string, section: string, locale: string): string {
  return readFileSync(
    join(project, "content", "home", `${section}.${locale}.md`),
    "utf8",
  );
}

async function checkSections(
  context: JourneyContext,
  backend: Backend,
  owner: Owner,
  project: string,
): Promise<void> {
  const sections = contentSections(project);
  const layout = await call(
    context,
    backend,
    "the home page layout",
    `${HOME}/pagelayout`,
    { token: owner.token },
  );
  const described = JSON.stringify(layout.body);
  context.expect(layout.folder, [
    equal("the layout answers 200", layout.status, 200),
    equal(
      "the layout holds the demo's hero and prose blocks",
      ["DemoHomeHero", "DemoHomeProse"].filter(
        (name) => !described.includes(`"${name}"`),
      ),
      [],
    ),
    equal(
      "every section of content/home has a block that fetches it",
      sections.filter((id) => !described.includes(`"${HOME}/sections/${id}"`)),
      [],
    ),
  ]);
  for (const section of sections) {
    const english = await call(
      context,
      backend,
      `section ${section}`,
      `${HOME}/sections/${section}`,
      { token: owner.token },
    );
    const french = await call(
      context,
      backend,
      `section ${section} in French`,
      `${HOME}/sections/${section}`,
      { token: owner.token, language: "fr-FR" },
    );
    context.expect(french.folder, [
      equal(
        `${section} answers its English Markdown by default`,
        [
          english.status,
          text(pick(english.body, "markdown")) ===
            markdownOf(project, section, "en-GB"),
        ],
        [200, true],
      ),
      equal(
        `${section} answers its French Markdown to fr-FR`,
        [
          french.status,
          text(pick(french.body, "markdown")) ===
            markdownOf(project, section, "fr-FR"),
        ],
        [200, true],
      ),
    ]);
  }
  const german = await call(
    context,
    backend,
    "a section in German",
    `${HOME}/sections/why`,
    { token: owner.token, language: "de-DE" },
  );
  const unknown = await call(
    context,
    backend,
    "an unknown section",
    `${HOME}/sections/nope`,
    { token: owner.token },
  );
  context.expect(unknown.folder, [
    equal(
      "another language falls back to English",
      text(pick(german.body, "markdown")) ===
        markdownOf(project, "why", "en-GB"),
      true,
    ),
    equal("an unknown section is a 404", unknown.status, 404),
  ]);
}

const homePage: Journey = {
  title:
    "the home page lays out the demo's hero and one block per section of `content/home/`, serves each section's Markdown in the reader's language with English as the fallback, and counts its figures from what is registered",
  entryPoint:
    "`/dms/pages/home/pagelayout`, `/dms/pages/home/sections/:id` with `x-content-language` and `/dms/pages/home/figures`, which the dashboard's home page calls",
  async run(context) {
    const project = await scaffolded(context);
    const backend = await startBackend(context, project);
    const anonymous = await call(
      context,
      backend,
      "a section without a token",
      `${HOME}/sections/why`,
    );
    context.expect(anonymous.folder, [
      equal("a section without a token is a 401", anonymous.status, 401),
    ]);
    const owner = await createOwner(context, backend);
    await checkSections(context, backend, owner, project);
    const figures = await call(
      context,
      backend,
      "the home figures",
      `${HOME}/figures`,
      { token: owner.token },
    );
    const counted = items(pick(figures.body, "items"));
    const value = (id: string) =>
      pick(
        counted.find((item) => pick(item, "id") === id),
        "value",
      );
    const stored = await mongo(
      context,
      "mongosh lists the demo collections",
      `db.getCollectionNames().filter((name) => name.startsWith("${demoCollection("helio_")}")).length`,
    );
    context.expect(stored.folder, [
      equal(
        "the figures answer their five cells in order",
        [figures.status, counted.map((item) => pick(item, "id") ?? null)],
        [200, FIGURES],
      ),
      equal(
        "the collections figure is the number of Helio collections in MongoDB",
        value("collections"),
        stored.value,
      ),
      equal(
        "Helio counts no custom Vue block, as the README says",
        value("vue"),
        0,
      ),
    ]);
  },
};

function customerIds(value: Json | undefined): Json[] {
  return items(value).map((row) => pick(row, "_id") ?? null);
}

async function checkStoredCustomers(
  context: JourneyContext,
  backend: Backend,
  owner: Owner,
): Promise<void> {
  const anonymous = await call(
    context,
    backend,
    "customers without a token",
    "/api/helio/customers/list",
  );
  const listed = await call(
    context,
    backend,
    "the customers list",
    "/api/helio/customers/list?limit=1000",
    { token: owner.token },
  );
  const stored = await mongo(
    context,
    "mongosh reads the customers",
    `db.getCollection("${CUSTOMERS}").find({}, { _id: 1 }).sort({ _id: 1 }).toArray().map((row) => row._id)`,
  );
  const ids = customerIds(pick(listed.body, "results"));
  context.expect(stored.folder, [
    equal("the customers list without a token is a 401", anonymous.status, 401),
    equal(
      "the list answers 200 with every row the collection holds",
      [listed.status, pick(listed.body, "total") ?? null],
      [200, items(stored.value).length],
    ),
    equal(
      "the listed ids are the stored ones",
      [...ids].map((id) => text(id)).sort(),
      items(stored.value).map((id) => text(id)),
    ),
    equal("the fixtures wrote customers", items(stored.value).length > 0, true),
  ]);
}

async function checkCustomerWrites(
  context: JourneyContext,
  backend: Backend,
  owner: Owner,
): Promise<void> {
  const invalid = await call(
    context,
    backend,
    "a business with a wrong VAT number",
    "/api/helio/customers/new",
    {
      token: owner.token,
      body: { ...NEW_CUSTOMER, vatNumber: "BE0123.456.789" },
    },
  );
  const created = await call(
    context,
    backend,
    "a business with a valid VAT number",
    "/api/helio/customers/new",
    {
      token: owner.token,
      body: { ...NEW_CUSTOMER, vatNumber: "BE0123.456.749" },
    },
  );
  const id = text(pick(created.body, "_id"));
  const stored = await mongo(
    context,
    "mongosh reads the new customer",
    `db.getCollection("${CUSTOMERS}").find({ name: "${NEW_CUSTOMER.name}" }).toArray().map((row) => ({ _id: row._id, kind: row.kind, vatNumber: row.vatNumber, email: row.email }))`,
  );
  context.expect(
    stored.folder,
    [
      equal(
        "a VAT number with wrong check digits is a 400",
        invalid.status,
        400,
      ),
      equal(
        "a valid VAT number creates the customer",
        [created.status, id !== ""],
        [200, true],
      ),
      equal("MongoDB holds only the valid customer, as sent", stored.value, [
        {
          _id: id,
          kind: "business",
          vatNumber: "BE0123.456.749",
          email: NEW_CUSTOMER.email,
        },
      ]),
    ],
    { critical: true },
  );
  const active = await call(
    context,
    backend,
    "delete the active customer",
    `/api/helio/customers/delete?id=${id}`,
    { token: owner.token, method: "DELETE" },
  );
  const archived = await call(
    context,
    backend,
    "archive the customer",
    `/api/helio/customers/archive?ids=${id}`,
    { token: owner.token, method: "PUT" },
  );
  const removed = await call(
    context,
    backend,
    "delete the archived customer",
    `/api/helio/customers/delete?id=${id}`,
    { token: owner.token, method: "DELETE" },
  );
  const gone = await mongo(
    context,
    "mongosh looks for the deleted customer",
    `db.getCollection("${CUSTOMERS}").countDocuments({ _id: "${id}" })`,
  );
  context.expect(gone.folder, [
    equal("deleting an active customer is a 409", active.status, 409),
    equal(
      "archiving answers 200 and archives it",
      [archived.status, pick(archived.body, "archivedCount") ?? null],
      [200, 1],
    ),
    equal("deleting the archived customer answers 200", removed.status, 200),
    equal("MongoDB no longer holds it", gone.value, 0),
  ]);
}

const helioData: Journey = {
  title:
    "Helio's customers live in the `template-dms-demo__helio_customers` collection: the list answers every stored row, a business needs a valid VAT number, and only an archived customer can be deleted",
  entryPoint:
    "`/api/helio/customers/list`, `new`, `archive` and `delete`, which the Customers page of the dashboard calls",
  async run(context) {
    const project = await scaffolded(context);
    const backend = await startBackend(context, project);
    const owner = await createOwner(context, backend);
    await checkStoredCustomers(context, backend, owner);
    await checkCustomerWrites(context, backend, owner);
  },
};

const COUNTS = `Object.fromEntries(db.getCollectionNames().filter((name) => name.startsWith("${demoCollection("")}") || ["dms-core__tenants", "dms-tenant__mailing_templates", "dms-tenant__media_folders", "dms-core__plans"].includes(name)).sort().map((name) => [name, db.getCollection(name).countDocuments()]))`;

const PROVISIONING = `(() => { const tenant = db.getCollection("dms-core__tenants").findOne({ _id: "default" }); return tenant === null ? "absent" : tenant.provisioningPending === true ? "pending" : "done"; })()`;
const PROVISIONING_ATTEMPTS = 180;

/** Waits until the DMS has finished provisioning its default tenant, Helio's steps included: `provisioningPending` clears only when every step succeeded. */
async function provisioned(
  context: JourneyContext,
  name: string,
): Promise<void> {
  let state = await mongo(context, name, PROVISIONING);
  for (
    let attempt = 1;
    attempt < PROVISIONING_ATTEMPTS && state.value !== "done";
    attempt += 1
  ) {
    await sleep(1000);
    state = await mongo(context, name, PROVISIONING);
  }
  context.expect(
    state.folder,
    [
      equal(
        "the default tenant's provisioning, Helio's steps included, completed",
        state.value,
        "done",
      ),
    ],
    { critical: true },
  );
}

const restart: Journey = {
  title:
    "the first start provisions the default tenant with every Helio step, and a second start on the same database writes no Helio data twice: every demo collection and the tenants, plans, e-mail templates and media folders Helio provisions keep their counts, and the setup token the second start prints creates the owner",
  entryPoint:
    "Ctrl+C on `pnpm dev` with `HELIO_SIMULATORS=off`, then `pnpm dev` again before the onboarding",
  async run(context) {
    const project = await scaffolded(context);
    const first = await startBackend(context, project, { env: SIMULATORS_OFF });
    await provisioned(
      context,
      "mongosh reads the default tenant's provisioning",
    );
    const before = await mongo(
      context,
      "mongosh counts the rows after the first start",
      COUNTS,
    );
    const stopped = await context.stop("Ctrl+C", first.app);
    context.expect(stopped.folder, [
      interrupted(stopped),
      equal(
        "the first start wrote Helio rows and tenants",
        keys(before.value).length > 4,
        true,
      ),
    ]);
    const second = await startBackend(context, project, {
      env: SIMULATORS_OFF,
    });
    await provisioned(
      context,
      "mongosh reads the default tenant's provisioning again",
    );
    const after = await mongo(
      context,
      "mongosh counts the rows after the second start",
      COUNTS,
    );
    context.expect(after.folder, [
      equal("the second start changed no count", after.value, before.value),
    ]);
    await createOwner(context, second);
  },
};

export const backendJourneys = {
  "home-page": homePage,
  "helio-data": helioData,
  restart,
};
