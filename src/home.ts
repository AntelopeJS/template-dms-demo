import { Get } from "@antelopejs/interface-api";
import {
  PageController,
  pageRoutePath,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import {
  Banner,
  Card,
  CodeBlock,
  KeyValueList,
  NavCardGrid,
  StatGroup,
} from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { helioCategory } from "./helio/category";
import { HOME_EXCERPT } from "./home-excerpt";
import { type HomeFigures, homeFigures } from "./home-figures";

const DOCS = "https://dms.antelopejs.com/docs";
const HOME_SLUG = "/home";

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

// The home page presents the template with DMS blocks only, like Helio
// itself: what the demo is, what AntelopeJS brought to build it, and where
// to start.
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
  static intro = Banner({
    tone: "primary",
    icon: "i-ph-sun",
    title: "$demo.home.intro.title",
    description: "$demo.home.intro.description",
    actions: [
      {
        label: "$demo.home.intro.docs",
        to: `${DOCS}/getting-started/introduction`,
        icon: "i-ph-book-open",
      },
      {
        label: "$demo.home.intro.open",
        to: "/helio/dashboard",
        icon: "i-ph-arrow-right",
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

  @Get("figures")
  async figureValues(): Promise<{ items: StatGroupItem[] }> {
    return { items: figureItems(await homeFigures()) };
  }

  // One card per Helio page, read from the menu: a new page shows up here
  // on its own, and a viewer only sees the pages their role opens.
  static helio = NavCardGrid({
    title: "$demo.home.helio.title",
    description: "$demo.home.helio.description",
    category: helioCategory,
    columns: 3,
  });

  static antelope = NavCardGrid({
    title: "$demo.home.antelope.title",
    description: "$demo.home.antelope.description",
    columns: 3,
    items: [
      {
        id: "pages",
        icon: "i-ph-browsers",
        title: "$demo.home.antelope.pages.title",
        description: "$demo.home.antelope.pages.description",
        to: `${DOCS}/building/pages-and-components`,
      },
      {
        id: "data",
        icon: "i-ph-database",
        title: "$demo.home.antelope.data.title",
        description: "$demo.home.antelope.data.description",
        to: `${DOCS}/components/data-controller`,
      },
      {
        id: "permissions",
        icon: "i-ph-shield-check",
        title: "$demo.home.antelope.permissions.title",
        description: "$demo.home.antelope.permissions.description",
        to: `${DOCS}/auth-and-tenancy/auth-and-permissions`,
      },
      {
        id: "realtime",
        icon: "i-ph-broadcast",
        title: "$demo.home.antelope.realtime.title",
        description: "$demo.home.antelope.realtime.description",
        to: `${DOCS}/building/backend-services#realtime`,
      },
      {
        id: "i18n",
        icon: "i-ph-translate",
        title: "$demo.home.antelope.i18n.title",
        description: "$demo.home.antelope.i18n.description",
        to: `${DOCS}/building/localization`,
      },
      {
        id: "modules",
        icon: "i-ph-puzzle-piece",
        title: "$demo.home.antelope.modules.title",
        description: "$demo.home.antelope.modules.description",
        to: "/modules",
      },
    ],
  });

  static start = Card({
    title: "$demo.home.start.title",
    description: "$demo.home.start.description",
  }).child("list", startList());

  static modules = Card({
    title: "$demo.home.modules.title",
    description: "$demo.home.modules.description",
  }).child("list", modulesList());

  static code = Card({
    title: "$demo.home.code.title",
    description: "$demo.home.code.description",
    actions: [
      {
        label: "$demo.home.code.docs",
        to: `${DOCS}/building/pages-and-components`,
        icon: "i-ph-book-open",
      },
    ],
  }).child(
    "excerpt",
    CodeBlock({
      title: HOME_EXCERPT.file,
      language: "typescript",
      code: HOME_EXCERPT.code,
    }),
  );
}

// The feature modules of antelope.config.ts, each linking to its pages;
// the builder has none of its own, it opens over any page with Ctrl+B.
function modulesList() {
  const module = (id: string, label: string, page: string) => ({
    id,
    label,
    value: `@antelopejs/dms-${id}`,
    type: "link" as const,
    to: `/modules/${page}`,
  });
  return KeyValueList({
    card: false,
    dense: true,
    columns: 2,
    items: [
      module("api", "$demo.home.modules.items.api", "api/overview"),
      module(
        "database",
        "$demo.home.modules.items.database",
        "database/overview",
      ),
      module(
        "automation",
        "$demo.home.modules.items.automation",
        "automation/overview",
      ),
      module(
        "saas",
        "$demo.home.modules.items.saas",
        "saas/overview/dashboard",
      ),
      module("ai", "$demo.home.modules.items.ai", "ai/overview"),
      module("lang", "$demo.home.modules.items.lang", "lang/overview"),
      module("media", "$demo.home.modules.items.media", "media/overview"),
      module(
        "marketing",
        "$demo.home.modules.items.marketing",
        "marketing/overview",
      ),
      module("mailing", "$demo.home.modules.items.mailing", "mailing/overview"),
      {
        id: "builder",
        label: "$demo.home.modules.items.builder",
        value: "@antelopejs/dms-builder",
        type: "mono",
        detail: "Ctrl+B",
      },
    ],
  });
}

function startList() {
  return KeyValueList({
    card: false,
    dense: true,
    columns: 2,
    items: [
      {
        id: "admin",
        label: "$demo.home.start.admin",
        value: "/onboarding",
        type: "mono",
      },
      {
        id: "helio",
        label: "$demo.home.start.helio",
        value: "$demo.home.start.helioLink",
        type: "link",
        to: "/helio/dashboard",
      },
      {
        id: "search",
        label: "$demo.home.start.search",
        value: "Ctrl/Cmd+K",
        type: "mono",
      },
      {
        id: "builder",
        label: "$demo.home.start.builder",
        value: "Ctrl+B",
        type: "mono",
      },
      {
        id: "components",
        label: "$demo.home.start.components",
        value: "$demo.home.start.componentsLink",
        type: "link",
        to: "/components/form",
      },
      {
        id: "simulators",
        label: "$demo.home.start.simulators",
        value: "HELIO_SIMULATORS=off",
        type: "mono",
        copy: true,
      },
    ],
  });
}
