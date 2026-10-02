import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { Column, Table as TanstackTable } from "@tanstack/react-table"
import { ArrowDownAZ, ArrowUpAZ, X } from "lucide-react"
import { Input } from "@/app/components/ui/input"
import type { ColumnFilterValue } from "@/app/components/ui/column-filter"

/** A column with more distinct values than this (and all numeric) is filtered by range instead of
 * by a checkbox list. */
const MAX_LIST_VALUES = 200
const MENU_WIDTH = 224

export interface ColumnMenuState { columnId: string; x: number; y: number }

function columnLabel<TData>(column: Column<TData, unknown>): string {
  return typeof column.columnDef.header === "string" ? column.columnDef.header : column.id
}

/** Floating Excel-style column menu (sort + filter), opened from a header's ellipsis button or its
 * right-click. Portalled with fixed positioning so the table's scroll container can't clip it. */
export function ColumnHeaderMenu<TData>({ table, state, onClose }: { table: TanstackTable<TData>; state: ColumnMenuState; onClose: () => void }) {
  const column = table.getColumn(state.columnId)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (ref.current?.contains(target) || target?.closest("[data-column-menu-trigger]")) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose])

  if (!column) return null
  const canSort = column.getCanSort()
  const canFilter = column.getCanFilter()
  const sorted = column.getIsSorted()
  const filtered = column.getFilterValue() !== undefined

  const left = Math.max(4, Math.min(state.x, window.innerWidth - MENU_WIDTH - 4))
  const top = Math.max(4, Math.min(state.y, window.innerHeight - 120))
  const itemClass = "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted disabled:opacity-40"

  return createPortal(
    <div
      ref={ref}
      style={{ left, top, width: MENU_WIDTH, maxHeight: window.innerHeight - top - 8 }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{columnLabel(column)}</div>
      {canSort && (
        <>
          <button type="button" className={itemClass} onClick={() => { column.toggleSorting(false); onClose() }}>
            <ArrowUpAZ className="size-3.5" /> Sort ascending {sorted === "asc" && "✓"}
          </button>
          <button type="button" className={itemClass} onClick={() => { column.toggleSorting(true); onClose() }}>
            <ArrowDownAZ className="size-3.5" /> Sort descending {sorted === "desc" && "✓"}
          </button>
          <button type="button" className={itemClass} disabled={!sorted} onClick={() => { column.clearSorting(); onClose() }}>
            <X className="size-3.5" /> Clear sort
          </button>
        </>
      )}
      {canSort && canFilter && <div className="my-1 h-px bg-border" />}
      {canFilter && <FilterSection table={table} column={column} />}
      {canFilter && (
        <button type="button" className={itemClass} disabled={!filtered} onClick={() => column.setFilterValue(undefined)}>
          <X className="size-3.5" /> Clear filter
        </button>
      )}
    </div>,
    document.body,
  )
}

function FilterSection<TData>({ table, column }: { table: TanstackTable<TData>; column: Column<TData, unknown> }) {
  // Distinct values come from every row, not just the filtered ones, so an applied filter never
  // hides the values needed to widen it again.
  const counts = useMemo(() => {
    const map = new Map<unknown, number>()
    for (const row of table.getCoreRowModel().rows) {
      const v = row.getValue(column.id)
      map.set(v, (map.get(v) ?? 0) + 1)
    }
    return map
  }, [table, column])
  const numeric = useMemo(() => [...counts.keys()].every((v) => typeof v === "number"), [counts])
  const useRange = numeric && counts.size > MAX_LIST_VALUES
  return useRange ? <RangeFilter column={column} counts={counts} /> : <ListFilter column={column} counts={counts} />
}

function ListFilter<TData>({ column, counts }: { column: Column<TData, unknown>; counts: Map<unknown, number> }) {
  const [search, setSearch] = useState("")
  const all = useMemo(() => [...counts.keys()].sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true }))), [counts])
  const current = column.getFilterValue() as ColumnFilterValue | undefined
  const selected = useMemo(() => new Set(current?.kind === "list" ? current.values : all), [current, all])
  const shown = all.filter((v) => String(v).toLowerCase().includes(search.toLowerCase()))
  const allShownChecked = shown.length > 0 && shown.every((v) => selected.has(v))

  const commit = (next: Set<unknown>) => {
    column.setFilterValue(next.size === all.length ? undefined : { kind: "list", values: [...next] })
  }
  const toggleShown = () => {
    const next = new Set(selected)
    for (const v of shown) { if (allShownChecked) next.delete(v); else next.add(v) }
    commit(next)
  }
  const toggle = (v: unknown) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v); else next.add(v)
    commit(next)
  }

  return (
    <div className="flex min-h-0 flex-col gap-1 px-1 pb-1">
      <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-6 text-xs" />
      <label className="flex items-center gap-2 px-1 py-0.5 hover:bg-muted">
        <input type="checkbox" checked={allShownChecked} onChange={toggleShown} />
        <span>{search ? "(Select all shown)" : "(Select all)"}</span>
      </label>
      <div className="max-h-48 overflow-auto">
        {shown.map((v) => (
          <label key={String(v)} className="flex items-center gap-2 px-1 py-0.5 hover:bg-muted">
            <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
            <span className="min-w-0 flex-1 truncate font-mono">{String(v)}</span>
            <span className="text-[10px] text-muted-foreground">{counts.get(v)}</span>
          </label>
        ))}
        {shown.length === 0 && <p className="px-1 py-1 text-muted-foreground">No matches.</p>}
      </div>
    </div>
  )
}

function RangeFilter<TData>({ column, counts }: { column: Column<TData, unknown>; counts: Map<unknown, number> }) {
  const current = column.getFilterValue() as ColumnFilterValue | undefined
  const range: { min?: number; max?: number } = current?.kind === "range" ? current : {}
  const bounds = useMemo(() => {
    const values = [...counts.keys()] as number[]
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [counts])

  const set = (patch: { min?: number; max?: number }) => {
    const next = { kind: "range" as const, min: range.min, max: range.max, ...patch }
    column.setFilterValue(next.min === undefined && next.max === undefined ? undefined : next)
  }
  const field = (key: "min" | "max") => (
    <Input
      key={`${key}-${range[key] ?? ""}`}
      placeholder={`${key} (${bounds[key].toPrecision(4)})`}
      defaultValue={range[key] === undefined ? "" : String(range[key])}
      onBlur={(e) => {
        const text = e.target.value.trim()
        const n = Number(text)
        if (text === "") set({ [key]: undefined })
        else if (Number.isFinite(n)) set({ [key]: n })
        else e.target.value = range[key] === undefined ? "" : String(range[key])
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
      className="h-6 text-xs"
    />
  )
  return (
    <div className="grid grid-cols-2 gap-1 px-1 pb-1">
      {field("min")}
      {field("max")}
    </div>
  )
}
