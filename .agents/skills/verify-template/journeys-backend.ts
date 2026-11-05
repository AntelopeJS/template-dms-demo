import {
  equal,
  interrupted,
  type Journey,
  type JourneyContext,
} from "@antelopejs/tooling-configs/verify";

import { homeJourneys } from "./journeys-home.ts";
import { items, keys, pick, text, type Json } from "./json.ts";
import { provisioned } from "./provisioning.ts";
import {
  call,
  createOwner,
  demoCollection,
  mongo,
  scaffolded,
  startBackend,
  type Backend,
  type Owner,
} from "./project.ts";

const CUSTOMERS = demoCollection("helio_customers");
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

/** The collections the template's tables are stored in, as a running project already holds them. */
const STORED_COLLECTIONS = [
  "helio_activity",
  "helio_customers",
  "helio_deals",
  "helio_invoices",
  "helio_mail_notices",
  "helio_product_categories",
  "helio_products",
  "helio_project_tasks",
  "helio_projects",
  "helio_quotes",
  "helio_settings",
  "helio_sites",
  "helio_team",
  "helio_tickets",
].map(demoCollection);

/** The fields the stored customers hold between them, as `Customer` declares them. */
const CUSTOMER_FIELDS = [
  "_id",
  "_instance",
  "_internal",
  "address",
  "contactName",
  "createdAt",
  "email",
  "isArchived",
  "isVip",
  "kind",
  "name",
  "notes",
  "owner",
  "phone",
  "segments",
  "source",
  "vatNumber",
  "website",
];

/** Routes behind a permission guard: a request without a token must be refused, whatever the record. */
const GUARDED_ROUTES: { name: string; path: string; post: boolean }[] = [
  {
    name: "the customer delete dialog",
    path: "/api/helio/crm/customers/unknown/delete-confirm",
    post: false,
  },
  {
    name: "the project detail stats",
    path: "/api/helio/project-detail/unknown/stats",
    post: false,
  },
  {
    name: "closing a project",
    path: "/api/helio/project-detail/unknown/done",
    post: true,
  },
  {
    name: "the dashboard revenue figure",
    path: "/api/helio/dashboard/kpi/revenue",
    post: false,
  },
];

function customerIds(value: Json | undefined): Json[] {
  return items(value).map((row) => pick(row, "_id") ?? null);
}

async function checkStoredSchema(context: JourneyContext): Promise<void> {
  const collections = await mongo(
    context,
    "mongosh lists the collections of the template's schema",
    `db.getCollectionNames().filter((name) => name.startsWith("${demoCollection("")}")).sort()`,
  );
  const fields = await mongo(
    context,
    "mongosh lists the fields of the stored customers",
    `[...new Set(db.getCollection("${CUSTOMERS}").find().toArray().flatMap((row) => Object.keys(row)))].sort()`,
  );
  context.expect(fields.folder, [
    equal(
      "MongoDB holds the collections of the template's tables, under their names",
      collections.value,
      STORED_COLLECTIONS,
    ),
    equal(
      "the stored customers hold the fields Customer declares",
      fields.value,
      CUSTOMER_FIELDS,
    ),
  ]);
}

async function checkStoredCustomers(
  context: JourneyContext,
  backend: Backend,
  owner: Owner,
): Promise<string> {
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
  return text(items(stored.value)[0]);
}

async function checkGuards(
  context: JourneyContext,
  backend: Backend,
  owner: Owner,
  customerId: string,
): Promise<void> {
  const refusals: [string, number][] = [];
  for (const route of GUARDED_ROUTES) {
    const answer = await call(
      context,
      backend,
      `${route.name} without a token`,
      route.path,
      route.post ? { body: {} } : {},
    );
    refusals.push([route.name, answer.status]);
  }
  const allowed = await call(
    context,
    backend,
    "the customer delete dialog with the owner's token",
    `/api/helio/crm/customers/${customerId}/delete-confirm`,
    { token: owner.token },
  );
  context.expect(allowed.folder, [
    equal(
      "every guarded Helio route refuses a request without a token with a 401 or 403",
      refusals.filter(([, status]) => status !== 401 && status !== 403),
      [],
    ),
    equal(
      "the owner's token opens the customer delete dialog",
      allowed.status,
      200,
    ),
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
    "Helio's tables live in the `template-dms-demo__helio_*` collections the template names, and its customers hold the fields `Customer` declares: the list answers every stored row, the guarded routes refuse a request without a token, a business needs a valid VAT number, and only an archived customer can be deleted",
  entryPoint:
    "`/api/helio/customers/list`, `new`, `archive` and `delete`, and the guarded `/api/helio/crm`, `/api/helio/project-detail` and `/api/helio/dashboard` routes, which the pages of the dashboard call",
  async run(context) {
    const project = await scaffolded(context);
    const backend = await startBackend(context, project, {
      env: SIMULATORS_OFF,
    });
    await provisioned(
      context,
      "mongosh reads the default tenant's provisioning",
    );
    const owner = await createOwner(context, backend);
    await checkStoredSchema(context);
    const customerId = await checkStoredCustomers(context, backend, owner);
    await checkGuards(context, backend, owner, customerId);
    await checkCustomerWrites(context, backend, owner);
  },
};

const COUNTS = `Object.fromEntries(db.getCollectionNames().filter((name) => name.startsWith("${demoCollection("")}") || ["dms-core__tenants", "dms-tenant__mailing_templates", "dms-tenant__media_folders", "dms-core__plans"].includes(name)).sort().map((name) => [name, db.getCollection(name).countDocuments()]))`;

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
  ...homeJourneys,
  "helio-data": helioData,
  restart,
};
