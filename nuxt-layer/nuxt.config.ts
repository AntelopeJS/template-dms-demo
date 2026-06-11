import { resolve } from "pathe";

const layerDir = import.meta.dirname!;

export default defineNuxtConfig({
  components: {
    dirs: [
      {
        path: resolve(layerDir, "app/components"),
        prefix: "Demo",
        pathPrefix: false,
        global: false,
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
