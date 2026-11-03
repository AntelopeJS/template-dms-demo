const FIXED_NOW = "2026-06-15T09:00:00Z";
const DEFAULT_PORT = "3001";
const SETUP_TOKEN = "helio-capture-setup-token";
const API_HOST = "127.0.0.1";

/** The value of `name` in `env`, or `fallback` when it is unset, empty or only spaces. */
function valueOr(env: NodeJS.ProcessEnv, name: string, fallback: string) {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

/**
 * The environment of a capture run: a fixed instant, UTC, and no simulators, so two runs show the same data.
 *
 * The DMS asks for a setup token on the owner step of the onboarding, so a scene opens `/onboarding?token=` followed
 * by `DMS_SETUP_TOKEN`, or fills the `setupToken` field with it. An unset or empty `DMS_SETUP_TOKEN` is the fixed
 * `helio-capture-setup-token`, never a random one. The backend listens on `HELIO_API_HOST`, `127.0.0.1` by default,
 * because the token is public.
 */
export function captureEnvironment(env: NodeJS.ProcessEnv) {
  const port = valueOr(env, "PORT", DEFAULT_PORT);
  return {
    ...env,
    PORT: port,
    DMS_CLIENT_BASE_URL: valueOr(
      env,
      "DMS_CLIENT_BASE_URL",
      `http://localhost:${port}`,
    ),
    TZ: "UTC",
    HELIO_NOW: valueOr(env, "HELIO_NOW", FIXED_NOW),
    HELIO_SIMULATORS: "off",
    DMS_SETUP_TOKEN: valueOr(env, "DMS_SETUP_TOKEN", SETUP_TOKEN),
    HELIO_API_HOST: valueOr(env, "HELIO_API_HOST", API_HOST),
  };
}
