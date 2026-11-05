import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  equal,
  type Journey,
  type JourneyContext,
} from "@antelopejs/tooling-configs/verify";

import { items, pick, text, type Json } from "./json.ts";
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

const HOME = "/dms/pages/home";
const FIGURES = ["pages", "collections", "controllers", "vue", "modules"];

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

function helioSources(project: string): string[] {
  const root = join(project, "src", "helio");
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(join(root, file), "utf8"));
}

/**
 * The Helio menu pages the sources declare: every `@RegisterPage()` outside the one detail page, whose blocks read the record from `{{params.…}}` in the URL. The figure counts layout routes at runtime instead.
 */
function declaredMenuPages(project: string): number {
  return helioSources(project)
    .filter((source) => !source.includes("{{params."))
    .reduce(
      (total, source) =>
        total + (source.match(/@RegisterPage\(\)/g)?.length ?? 0),
      0,
    );
}

/** The `/api/helio/<name>` paths of the classes the sources register as data controllers. */
function declaredControllerPaths(project: string): string[] {
  const paths = helioSources(project)
    .filter((source) => source.includes("@RegisterDataController()"))
    .flatMap((source) => [
      ...source.matchAll(/\bController\(\s*"(\/api\/helio\/[\w-]+)"\s*\)/g),
    ])
    .map((match) => match[1] ?? "");
  return [...new Set(paths)].sort();
}

/** The DMS feature modules `antelope.config.ts` loads: every `@antelopejs/dms-<feature>` module, whose frontend layer the figure counts. */
function loadedFeatureModules(project: string): number {
  const config = readFileSync(join(project, "antelope.config.ts"), "utf8");
  const modules = [...config.matchAll(/"(@antelopejs\/dms-[\w-]+)"/g)]
    .map((match) => match[1] ?? "")
    .filter((name) => name !== "@antelopejs/dms-frontend");
  return new Set(modules).size;
}

/** How many of the declared data controllers answer their list route with 200, asked over HTTP. */
async function listingControllers(
  context: JourneyContext,
  backend: Backend,
  owner: Owner,
  project: string,
): Promise<number> {
  let listing = 0;
  for (const path of declaredControllerPaths(project)) {
    const listed = await call(
      context,
      backend,
      `list ${path}`,
      `${path}/list?limit=1`,
      { token: owner.token },
    );
    if (listed.status === 200) listing += 1;
  }
  return listing;
}

async function checkFigures(
  context: JourneyContext,
  backend: Backend,
  owner: Owner,
  project: string,
): Promise<void> {
  const figures = await call(
    context,
    backend,
    "the home figures",
    `${HOME}/figures`,
    { token: owner.token },
  );
  const counted = items(pick(figures.body, "items"));
  const value = (id: string): Json | undefined =>
    pick(
      counted.find((item) => pick(item, "id") === id),
      "value",
    );
  const stored = await mongo(
    context,
    "mongosh lists the demo collections",
    `db.getCollectionNames().filter((name) => name.startsWith("${demoCollection("helio_")}")).length`,
  );
  const listing = await listingControllers(context, backend, owner, project);
  const menuPages = declaredMenuPages(project);
  context.expect(figures.folder, [
    equal(
      "the figures answer their five cells in order",
      [figures.status, counted.map((item) => pick(item, "id") ?? null)],
      [200, FIGURES],
    ),
    equal(
      "the sources register menu pages and data controllers that list",
      [menuPages > 0, listing > 0],
      [true, true],
    ),
    equal(
      "the pages figure is the number of menu pages the sources register",
      value("pages") ?? null,
      menuPages,
    ),
    equal(
      "the collections figure is the number of Helio collections in MongoDB",
      value("collections") ?? null,
      stored.value,
    ),
    equal(
      "the controllers figure is the number of declared data controllers that answer their list route",
      value("controllers") ?? null,
      listing,
    ),
    equal(
      "Helio counts no custom Vue block, as the README says",
      value("vue") ?? null,
      0,
    ),
    equal(
      "the modules figure is the number of DMS feature modules antelope.config.ts loads",
      value("modules") ?? null,
      loadedFeatureModules(project),
    ),
  ]);
}

const homePage: Journey = {
  title:
    "the home page lays out the demo's hero and one block per section of `content/home/`, serves each section's Markdown in the reader's language with English as the fallback, and counts its figures from what is registered: the menu pages, controllers and modules match counts the journey derives from the scaffold and from the API",
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
    await checkFigures(context, backend, owner, project);
  },
};

export const homeJourneys = { "home-page": homePage };
