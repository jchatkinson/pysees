import { flexRender, type Table as TanstackTable } from "@tanstack/react-table"
import { useCallback, useState } from "react"
import { ArrowDown, ArrowUp, EllipsisVertical, ListFilter } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table"
import { Button } from "@/app/components/ui/button"
import { ColumnHeaderMenu, type ColumnMenuState } from "@/app/components/ui/column-header-menu"

/** Every row the table currently matches (sorted + filtered, across all pages) as raw cell values
 * under plain-text headers — what Copy and CSV export, rather than the formatted/paginated view. */
function exportGrid<TData>(table: TanstackTable<TData>): string[][] {
  const columns = table.getVisibleLeafColumns()
  const header = columns.map((c) => (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id))
  const body = table.getPrePaginationRowModel().rows.map((row) => columns.map((c) => String(row.getValue(c.id) ?? "")))
  return [header, ...body]
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Generic sortable/paginated table body for `@tanstack/react-table` — the table instance (data,
 * columns, sorting/filter state) is built by the caller; this just renders it against the
 * project's existing `ui/table.tsx` primitives. */
export function DataTable<TData>({ table, emptyMessage = "No results." }: { table: TanstackTable<TData>; emptyMessage?: string }) {
  const rows = table.getRowModel().rows
  const columnCount = table.getAllLeafColumns().length
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState<ColumnMenuState | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const filterCount = table.getState().columnFilters.length

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(exportGrid(table).map((r) => r.join("\t")).join("\n"))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable (insecure context or denied) */ }
  }
  const downloadCsv = () => {
    const csv = exportGrid(table).map((r) => r.map(csvCell).join(",")).join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "results.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-auto">
        <Table className="border-separate border-spacing-0 text-xs">
          <TableHeader className="sticky top-0 z-10 bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const column = header.column
                  const hasMenu = column.getCanSort() || column.getCanFilter()
                  const sorted = column.getIsSorted()
                  const filtered = column.getFilterValue() !== undefined
                  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setMenu((m) => (m?.columnId === column.id ? null : { columnId: column.id, x: rect.left, y: rect.bottom + 2 }))
                  }
                  return (
                    <TableHead
                      key={header.id}
                      className="h-6 border-b border-r border-border bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground first:border-l border-t"
                      onContextMenu={hasMenu ? (e) => { e.preventDefault(); setMenu({ columnId: column.id, x: e.clientX, y: e.clientY }) } : undefined}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-1 select-none">
                          {flexRender(column.columnDef.header, header.getContext())}
                          {sorted === "asc" && <ArrowUp className="size-3 text-primary" />}
                          {sorted === "desc" && <ArrowDown className="size-3 text-primary" />}
                          {filtered && <ListFilter className="size-3 text-primary" />}
                          {hasMenu && (
                            <button type="button" data-column-menu-trigger aria-label={`${column.id} column menu`} className="ml-auto rounded text-muted-foreground hover:text-foreground" onClick={toggleMenu}>
                              <EllipsisVertical className="size-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-6 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="border-0 hover:bg-muted/40">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="whitespace-nowrap border-b border-r border-border px-1.5 py-0.5 font-mono text-xs tabular-nums first:border-l">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t px-2 py-1 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span>{table.getFilteredRowModel().rows.length} row(s)</span>
          {filterCount > 0 && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => table.resetColumnFilters()}>
              Clear filters
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={copyAll} disabled={rows.length === 0}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={downloadCsv} disabled={rows.length === 0}>
            CSV
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Prev
          </Button>
          <span>{table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}</span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
      {menu && <ColumnHeaderMenu table={table} state={menu} onClose={closeMenu} />}
    </div>
  )
}
