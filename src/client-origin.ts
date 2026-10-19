// The dashboard's origin, read from DMS_CLIENT_BASE_URL: the base of the
// backend's e-mail links and redirects, the one origin its CORS lets in and
// the one host OAuth may return to.

const CLIENT_BASE_URL_VARIABLE = "DMS_CLIENT_BASE_URL";

// `ajs dms dev`; `localhost` and `127.0.0.1` are distinct browser origins.
const DEVELOPMENT_ORIGINS = ["http://localhost:3001", "http://127.0.0.1:3001"];

/**
 * The origins the dashboard is served from: the one DMS_CLIENT_BASE_URL
 * names, else the development server's. The first is the base URL.
 *
 * @throws When the variable is set to anything but an http(s) origin
 */
export function clientOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env[CLIENT_BASE_URL_VARIABLE]?.trim();
  if (!raw) return [...DEVELOPMENT_ORIGINS];
  return [parseClientOrigin(raw)];
}

function parseClientOrigin(raw: string): string {
  const invalid = new Error(
    `${CLIENT_BASE_URL_VARIABLE} must be the dashboard's origin, such as https://dashboard.example.com, without a path.`,
  );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid;
  }
  const isHttp = url.protocol === "https:" || url.protocol === "http:";
  const isOrigin =
    url.pathname === "/" && !url.search && !url.hash && !url.username;
  if (!isHttp || !isOrigin) throw invalid;
  return url.origin;
}

/**
 * Refuses a production start on the development origin.
 *
 * @throws When DMS_CLIENT_BASE_URL is unset or blank
 */
export function assertClientBaseUrlSet(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env[CLIENT_BASE_URL_VARIABLE]?.trim()) return;
  throw new Error(
    `${CLIENT_BASE_URL_VARIABLE} is required in production: e-mail links, redirects and CORS start from the dashboard's origin, and the development one is localhost.`,
  );
}
