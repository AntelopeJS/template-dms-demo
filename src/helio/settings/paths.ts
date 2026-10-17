import { pageRoutePath } from "@antelopejs/interface-dms/page";

/** Full slug of the Settings page (helio root category, then the page id). */
export const SETTINGS_SLUG = "/helio/settings";

// The routes the page class declares, as the browser calls them.
export const SETTINGS_VALUES_URL = pageRoutePath(SETTINGS_SLUG, "/values");
export const SETTINGS_ROTATE_URL = pageRoutePath(
  SETTINGS_SLUG,
  "/api-key/rotate",
);
export const SETTINGS_DANGER_URL = pageRoutePath(SETTINGS_SLUG, "/danger-zone");
export const SETTINGS_RESET_URL = pageRoutePath(SETTINGS_SLUG, "/reset");
