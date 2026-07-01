import { resolve } from "pathe";

const layerDir = import.meta.dirname!;

export default defineNuxtConfig({
  cmsI18nAppLayer: true,

  components: {
    dirs: [
      {
        path: resolve(layerDir, "app/components"),
        prefix: "Demo",
        pathPrefix: false,
        global: true,
      },
    ],
  },

  i18n: {
    locales: [
      { code: "en", file: "demo-en-GB.json" },
      { code: "fr", file: "demo-fr-FR.json" },
    ],
    langDir: "locales",
  },
});
