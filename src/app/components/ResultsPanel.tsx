import { useEffect, useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { DataTable } from '@/app/components/ui/data-table'
import { listRuns, queryJointDisplacements } from '@/app/lib/resultsStorage/resultsStorageClient'
import type { RunMetadata } from '@/app/types/resultsStorage'

/** ETABS-style pooled results table: every stored run's joint displacements, flattened into one
 * (case, stage, step, node) row shape and sorted/filtered client-side. Other result types
 * (element forces, base reactions) will slot in the same way once Carapace records them — each
 * just needs its own flatten query and column set, reusing this same table shell. */
interface DisplacementRow {
  runId: string
  stageIndex: number
  step: number
  pseudoTime: number
  node: string
  values: number[]
}

const RESULT_TYPES = [
  { id: 'joint-displacements', label: 'Joint Displacements' },
  { id: 'element-forces', label: 'Element Forces (soon)' },
  { id: 'reactions', label: 'Base Reactions (soon)' },
] as const

function shortRunId(runId: string): string {
  return runId.length > 10 ? `${runId.slice(0, 8)}…` : runId
}

export function ResultsPanel() {
  const [resultType, setResultType] = useState<string>('joint-displacements')
  const [runs, setRuns] = useState<RunMetadata[]>([])
  const [rows, setRows] = useState<DisplacementRow[]>([])
  const [componentLabels, setComponentLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [caseFilter, setCaseFilter] = useState<string>('all')

  const load = () => {
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const { runs: allRuns } = await listRuns()
        const withData = allRuns.filter((r) => r.sampleCount > 0)
        const results = await Promise.all(withData.map((run) => queryJointDisplacements(run.runId)))
        const nextRows: DisplacementRow[] = []
        let labels: string[] = []
        results.forEach((result, i) => {
          const run = withData[i]
          if (result.recorders[0] && result.recorders[0].componentLayout.length > labels.length) {
            labels = result.recorders[0].componentLayout
          }
          for (const row of result.rows) {
            nextRows.push({ runId: run.runId, stageIndex: row.stageIndex, step: row.step, pseudoTime: row.pseudoTime, node: row.node, values: row.components })
          }
        })
        setRuns(allRuns)
        setRows(nextRows)
        setComponentLabels(labels)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }

  useEffect(() => { load() }, [])

  const columns = useMemo<ColumnDef<DisplacementRow>[]>(() => {
    const base: ColumnDef<DisplacementRow>[] = [
      { accessorKey: 'runId', header: 'Case', cell: (c) => shortRunId(c.getValue<string>()) },
      { accessorKey: 'stageIndex', header: 'Stage' },
      { accessorKey: 'step', header: 'Step' },
      { accessorKey: 'pseudoTime', header: 'Time', cell: (c) => c.getValue<number>().toPrecision(5) },
      { accessorKey: 'node', header: 'Node' },
    ]
    const dofCols: ColumnDef<DisplacementRow>[] = componentLabels.map((label, i) => ({
      id: `dof-${i}`,
      header: label,
      accessorFn: (row) => row.values[i],
      cell: (c) => {
        const v = c.getValue<number | undefined>()
        return v === undefined ? '' : v.toExponential(4)
      },
    }))
    return [...base, ...dofCols]
  }, [componentLabels])

  const filteredRows = useMemo(() => (caseFilter === 'all' ? rows : rows.filter((r) => r.runId === caseFilter)), [rows, caseFilter])

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 gap-1.5 border-b p-2">
        <div className="flex items-center gap-1.5">
          <Select value={resultType} onValueChange={(v) => { if (v) setResultType(v) }}>
            <SelectTrigger className="h-7 flex-1 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RESULT_TYPES.map((rt) => (
                <SelectItem key={rt.id} value={rt.id} disabled={rt.id !== 'joint-displacements'}>{rt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={load} disabled={loading} aria-label="Refresh">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={caseFilter} onValueChange={(v) => { if (v) setCaseFilter(v) }}>
            <SelectTrigger className="h-7 flex-1 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cases ({runs.length})</SelectItem>
              {runs.map((r) => <SelectItem key={r.runId} value={r.runId}>{shortRunId(r.runId)} — {r.status}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Filter…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-7 flex-1 text-[11px]" />
        </div>
      </div>
      {error && <p className="shrink-0 px-2 py-1 text-[11px] text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        <DataTable table={table} emptyMessage={loading ? 'Loading…' : 'No stored results yet — run an analysis first.'} />
      </div>
    </div>
  )
}
