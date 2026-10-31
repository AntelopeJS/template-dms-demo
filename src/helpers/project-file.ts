import { readFileSync } from "node:fs";
import path from "node:path";

/** The text of a file at the project root, whether the caller runs from `src` or from `dist`. */
export function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}
