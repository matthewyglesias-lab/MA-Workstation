import { addendaCount, searchText } from "./records-drawer-shared";

export type RecordListFilter = "all" | "draft" | "locked" | "addenda";

/** Read-only view of one validated repository snapshot. Recreate on every reload.
 * Neither this projection nor its caches are used to open/save/sign a record.
 * Search keeps the original whole-record substring semantics, including addenda.
 * Strings are built lazily and bounded to 1 MiB of UTF-16 content per window.
 * Oversize entries remain searchable without being retained in the cache.
 */
export function createRecordListView<R extends { status: string; addenda?: unknown[] }, V>(
  records: readonly R[], toRow: (record: R) => V,
) {
  const texts = new Map<R, string>();
  const rows = new Map<R, V>();
  const budget = 512 * 1024;
  let retainedCharacters = 0;
  const textFor = (record: R): string => {
    const cached = texts.get(record);
    if (cached !== undefined) return cached;
    const text = searchText(record);
    if (retainedCharacters + text.length <= budget) {
      texts.set(record, text);
      retainedCharacters += text.length;
    }
    return text;
  };
  return (query: string, filter: RecordListFilter): V[] => {
    const needle = query.trim().toLocaleLowerCase();
    const result: V[] = [];
    for (const record of records) {
      const eligible = filter === "all" || (filter === "addenda"
        ? addendaCount(record) > 0
        : record.status === (filter === "locked" ? "completed" : "draft"));
      if (!eligible || (needle && !textFor(record).includes(needle))) continue;
      if (!rows.has(record)) rows.set(record, toRow(record));
      result.push(rows.get(record)!);
    }
    return result;
  };
}
