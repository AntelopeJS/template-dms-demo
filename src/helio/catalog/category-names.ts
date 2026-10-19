import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { ProductCategoryModel } from "./database";

// A range's name is localized ({ en, fr }), and two things of this DMS
// version get in the way of reading it in every language:
// - the form writes the language nobody filled as "" (not absent), which the
//   localized field's fallback does not replace: a range created in English
//   read empty in French (its row, its "Actions for" menu, the main field of
//   its edit form), and the other way round;
// - the list sorts on the stored field, and a localized field is stored
//   under its languages: sorting by name kept the insertion order.
// So every write of the ranges table gives an unfilled language the name
// typed in the other one, and a list sorted by name is sorted here, in the
// caller's language.

/** The interface languages a localized name holds. */
const LANGUAGES = ["en", "fr"] as const;

type LocalizedName = Partial<Record<string, string>>;

const isFilled = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/** The names with each unfilled language given a filled one, or null. */
function withEveryLanguage(names: unknown): LocalizedName | null {
  if (!names || typeof names !== "object") return null;
  const record = names as LocalizedName;
  const filled = LANGUAGES.map((language) => record[language]).find(isFilled);
  const missing = LANGUAGES.filter((language) => !isFilled(record[language]));
  if (!filled || missing.length === 0) return null;
  return {
    ...record,
    ...Object.fromEntries(missing.map((language) => [language, filled])),
  };
}

/** Gives every range a name in each language (a few dozen rows at most). */
export async function fillMissingNames(): Promise<void> {
  const model = GetModel(ProductCategoryModel);
  const categories = await model.getAll();
  const updates = categories.flatMap((category) => {
    const names = withEveryLanguage(category.localize("*").name);
    if (!names) return [];
    const row = { _id: category._id, name: names as unknown as string };
    return [ProductCategoryModel.fromPlainData(row).localize("*")];
  });
  await Promise.all(updates.map((row) => model.update(row)));
}

// The rows a list sorted by name reads before paging them: every range.
const NAME_SORT_LIMIT = 1000;

interface ListParams {
  sortKey?: string;
  sortDirection?: string;
  offset?: number;
  limit?: number;
}

interface ListPage {
  results: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

function nameIn(row: Record<string, unknown>, language: string): string {
  const { name } = row;
  if (typeof name === "string") return name;
  return withEveryLanguage(name)?.[language] ?? "";
}

/**
 * The `list` route, sorted by the name in the caller's language when asked
 * to (both directions, unnamed rows last, ties by id so the pages hold).
 */
export function withNameSort(
  route: DataControllerCallback,
): DataControllerCallback {
  return {
    ...route,
    func: async function (
      this: { language?: string },
      ctx: unknown,
      params: ListParams | undefined,
      ...rest: unknown[]
    ) {
      const list = route.func as (...args: unknown[]) => Promise<ListPage>;
      if (params?.sortKey !== "name") {
        return list.call(this, ctx, params, ...rest);
      }
      const everyRow = {
        ...params,
        sortKey: undefined,
        sortDirection: undefined,
        offset: 0,
        limit: NAME_SORT_LIMIT,
      };
      const page = await list.call(this, ctx, everyRow, ...rest);
      const language = this.language === "*" ? "en" : (this.language ?? "en");
      const collator = new Intl.Collator(language, {
        sensitivity: "base",
        numeric: true,
      });
      const direction = params.sortDirection === "desc" ? -1 : 1;
      const named = page.results.map((row) => ({
        row,
        name: nameIn(row, language),
      }));
      named.sort(
        (a, b) =>
          Number(a.name === "") - Number(b.name === "") ||
          direction * collator.compare(a.name, b.name) ||
          String(a.row._id).localeCompare(String(b.row._id)),
      );
      const offset = params.offset ?? 0;
      const limit = params.limit ?? page.limit;
      return {
        ...page,
        results: named.slice(offset, offset + limit).map(({ row }) => row),
        offset,
        limit,
      };
    },
  };
}
