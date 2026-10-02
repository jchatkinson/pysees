import type { FilterFn } from "@tanstack/react-table"

/** What a column's filter holds: an Excel-style set of kept values, or a numeric range. */
export type ColumnFilterValue =
  | { kind: "list"; values: unknown[] }
  | { kind: "range"; min?: number; max?: number }

/** Set as `defaultColumn.filterFn` by any table that uses `DataTable`'s header menu. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const columnFilterFn: FilterFn<any> = (row, columnId, filter: ColumnFilterValue) => {
  const value = row.getValue(columnId)
  if (filter.kind === "list") return filter.values.includes(value)
  const n = Number(value)
  return (filter.min === undefined || n >= filter.min) && (filter.max === undefined || n <= filter.max)
}
columnFilterFn.autoRemove = (filter?: ColumnFilterValue) =>
  filter === undefined || (filter.kind === "list" ? false : filter.min === undefined && filter.max === undefined)
