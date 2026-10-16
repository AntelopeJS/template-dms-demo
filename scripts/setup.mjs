import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const SECRET_BYTES = 32;
const environment = [
  "DMS_API_BASE_URL=http://localhost:5010",
  `DMS_SESSION_SECRET=${randomBytes(SECRET_BYTES).toString("hex")}`,
  "MONGODB_URL=mongodb://localhost:27017",
  "MONGODB_DATABASE=template_dms_demo",
  "",
].join("\n");

try {
  await writeFile(new URL("../.env", import.meta.url), environment, {
    flag: "wx",
    mode: 0o600,
  });
  console.log("Created .env with a generated session secret.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Kept the existing .env unchanged.");
}

console.log("Start MongoDB and check MONGODB_URL in .env, then run pnpm dev.");
console.log(
  "In a second terminal, run pnpm frontend:dev and open the printed URL.",
);
console.log(
  "Create the first administrator through onboarding; there are no default credentials.",
);
