import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Get, HTTPResult, Parameter } from "@antelopejs/interface-api";
import {
  PageController,
  pageRoutePath,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import {
  Hero,
  NavCardGrid,
  Prose,
  StatGroup,
} from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { type HomeFigures, homeFigures } from "./home-figures";

const DOCS = "https://dms.antelopejs.com/docs";
const GITHUB = "https://github.com/AntelopeJS";
const HOME_SLUG = "/home";
const HTTP_NOT_FOUND = 404;

// The long texts live as Markdown, one file per section and language, in
// content/home (next to dist/, read on each request): Markdown and vue-i18n
// share `{`, `|` and `@`, so they are not i18n keys.
const CONTENT_DIR = resolve(__dirname, "..", "content", "home");
const SECTIONS = [
  "story",
  "guide",
  "modules",
  "cases",
  "start",
  "ai",
  "contribute",
] as const;
type Section = (typeof SECTIONS)[number];

function contentLocale(language: string | undefined): "fr-FR" | "en-GB" {
  return language?.toLowerCase().startsWith("fr") ? "fr-FR" : "en-GB";
}

const count = (value: number) => ({ type: "count", value }) as const;

// The five cells, from the figures counted at runtime.
function figureItems(figures: HomeFigures): StatGroupItem[] {
  return [
    {
      id: "pages",
      icon: "i-ph-browsers",
      eyebrow: "$demo.home.figures.pages.eyebrow",
      value: figures.menuPages,
      detail: {
        key: "$demo.home.figures.pages.detail",
        params: { count: count(figures.detailPages) },
      },
      to: "/helio/dashboard",
    },
    {
      id: "collections",
      icon: "i-ph-database",
      eyebrow: "$demo.home.figures.collections.eyebrow",
      value: figures.collections,
      detail: "$demo.home.figures.collections.detail",
    },
    {
      id: "controllers",
      icon: "i-ph-plugs-connected",
      eyebrow: "$demo.home.figures.controllers.eyebrow",
      value: figures.dataControllers,
      detail: "$demo.home.figures.controllers.detail",
    },
    {
      id: "vue",
      icon: "i-ph-file-vue",
      tone: figures.customBlocks === 0 ? "success" : "warning",
      eyebrow: "$demo.home.figures.vue.eyebrow",
      value: figures.customBlocks,
      detail: "$demo.home.figures.vue.detail",
      detailTone: figures.customBlocks === 0 ? "success" : "neutral",
    },
    {
      id: "modules",
      icon: "i-ph-puzzle-piece",
      eyebrow: "$demo.home.figures.modules.eyebrow",
      value: figures.modules,
      detail: "$demo.home.figures.modules.detail",
      to: "/modules",
    },
  ];
}

const section = (id: Section, wide = false) =>
  Prose({
    fetchUrl: pageRoutePath(HOME_SLUG, `/sections/${id}`),
    width: wide ? "wide" : "readable",
  });

// The home page tells what the demo is for and how to build the same thing:
// a hero, the figures counted live, then the story in long-form text. No
// component showcase here: those live under Components.
@RegisterPage()
export class PageHome extends PageController(
  "home",
  {
    displayName: "$demo.nav.home",
    icon: "i-ph-house",
    category: pagesCategory,
    order: 0,
    description: "$demo.pages.home.description",
  },
  DefaultLayout({ hideHeader: true }),
) {
  static hero = Hero({
    eyebrow: "$demo.home.hero.eyebrow",
    title: "$demo.home.hero.title",
    highlight: "$demo.home.hero.highlight",
    lead: "$demo.home.hero.lead",
    size: "lg",
    background: "gradient",
    icons: ["i-ph-sun", "i-ph-squares-four", "i-ph-lightning"],
    actions: [
      {
        label: "$demo.home.hero.open",
        to: "/helio/dashboard",
        icon: "i-ph-arrow-right",
        variant: "solid",
      },
      {
        label: "$demo.home.hero.docs",
        to: `${DOCS}/getting-started/introduction`,
        icon: "i-ph-book-open",
        variant: "outline",
      },
    ],
  });

  // Counted when the page is read, from what the module registered (see
  // home-figures.ts): nothing here is typed by hand.
  static figures = StatGroup({
    layout: "cards",
    columns: 5,
    label: "$demo.home.figures.label",
    fetchUrl: pageRoutePath(HOME_SLUG, "/figures"),
    skeletonCount: 5,
  });

  static story = section("story");
  static guide = section("guide");
  static modules = section("modules", true);
  static cases = section("cases");
  static start = section("start");
  static ai = section("ai");
  static contribute = section("contribute");

  static links = NavCardGrid({
    title: "$demo.home.links.title",
    columns: 3,
    items: [
      {
        id: "helio",
        icon: "i-ph-sun",
        title: "$demo.home.links.helio.title",
        description: "$demo.home.links.helio.description",
        to: "/helio/dashboard",
      },
      {
        id: "docs",
        icon: "i-ph-book-open",
        title: "$demo.home.links.docs.title",
        description: "$demo.home.links.docs.description",
        to: `${DOCS}/getting-started/introduction`,
      },
      {
        id: "quickstart",
        icon: "i-ph-rocket-launch",
        title: "$demo.home.links.quickstart.title",
        description: "$demo.home.links.quickstart.description",
        to: `${DOCS}/getting-started/quickstart`,
      },
      {
        id: "modules",
        icon: "i-ph-puzzle-piece",
        title: "$demo.home.links.modules.title",
        description: "$demo.home.links.modules.description",
        to: "/modules",
      },
      {
        id: "store",
        icon: "i-ph-storefront",
        title: "$demo.home.links.store.title",
        description: "$demo.home.links.store.description",
        to: "/modules/store",
      },
      {
        id: "github",
        icon: "i-ph-github-logo",
        title: "$demo.home.links.github.title",
        description: "$demo.home.links.github.description",
        to: GITHUB,
      },
    ],
  });

  @Get("figures")
  async figureValues(): Promise<{ items: StatGroupItem[] }> {
    return { items: figureItems(await homeFigures()) };
  }

  @Get("sections/:id")
  async sectionText(
    @Parameter("id") id: string,
    @Parameter("x-content-language", "header") language: string | undefined,
  ): Promise<{ markdown: string }> {
    if (!(SECTIONS as readonly string[]).includes(id)) {
      throw new HTTPResult(HTTP_NOT_FOUND, { error: "Unknown section" });
    }
    const file = resolve(CONTENT_DIR, `${id}.${contentLocale(language)}.md`);
    return { markdown: await readFile(file, "utf8") };
  }
}
