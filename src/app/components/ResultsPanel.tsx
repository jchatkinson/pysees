import { useEffect, useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { useAppStore } from '@/app/store/useAppStore'
import { formatResult } from '@/app/lib/formatResult'
import { DataTable } from '@/app/components/ui/data-table'
import { columnFilterFn } from '@/app/components/ui/column-filter'
import { modeFrequencyHz, modePeriod } from '@/app/lib/modal'
import { getRunLayout, listRuns, queryJointDisplacements, queryModal } from '@/app/lib/resultsStorage/resultsStorageClient'
import type { RecorderKind } from '@/app/types/resultsStorage'

/** ETABS-style pooled results table: every stored run's joint displacements, flattened into one
 * (case, stage, step, node) row shape and sorted/filtered client-side. Other result types
 * (element forces, base reactions) will slot in the same way once Carapace records them — each
 * just needs its own flatten query and column set, reusing this same table shell. */
interface DisplacementRow {
  runId: string
  /** The case (analysis stage) the row belongs to. */
  stageId: string
  /** Step within the case: 0 is its initial state. */
  step: number
  pseudoTime: number
  node: string
  values: number[]
}

const RESULT_TYPES = [
  { id: 'joint-displacements', label: 'Joint Displacements' },
  { id: 'element-forces', label: 'Element Forces' },
  { id: 'shell-resultants', label: 'Shell Stress Resultants' },
  { id: 'reactions', label: 'Reactions' },
  { id: 'modal-periods', label: 'Modal Periods and Frequencies' },
  { id: 'modal-mass', label: 'Modal Participating Mass Ratios' },
  { id: 'mode-shapes', label: 'Mode Shapes' },
] as const

/** One row of a modal table: `node` is only set for mode shapes; `values` line up with `modalValueLabels`. */
interface ModalRow { runId: string; stageId: string; mode: number; node: number | null; values: number[] }
const MODAL_TABLES = ['modal-periods', 'modal-mass', 'mode-shapes']
const isModalTable = (id: string) => MODAL_TABLES.includes(id)
/** Value columns of a modal table; mass ratios and shape components follow the model's dimension. */
function modalValueLabels(id: string, ndm: number): string[] {
  const dirs = ndm === 3 ? ['UX', 'UY', 'UZ'] : ['UX', 'UY']
  if (id === 'modal-periods') return ['Period (s)', 'Frequency (Hz)', 'ω (rad/s)', 'ω² (rad²/s²)']
  if (id === 'modal-mass') return [...dirs, ...dirs.map((d) => `Sum ${d}`)]
  return ndm === 3 ? ['dx', 'dy', 'dz', 'rx', 'ry', 'rz'] : ['dx', 'dy', 'rz']
}

const KIND_BY_RESULT_TYPE: Partial<Record<(typeof RESULT_TYPES)[number]['id'], RecorderKind>> = {
  'joint-displacements': 'disp',
  'element-forces': 'force',
  'shell-resultants': 'shell',
  'reactions': 'reaction',
}
const TARGET_HEADER: Record<RecorderKind, string> = { disp: 'Node', reaction: 'Node', force: 'Element', shell: 'Element' }

export function ResultsPanel() {
  const [resultType, setResultType] = useState<string>('joint-displacements')
  const [rows, setRows] = useState<DisplacementRow[]>([])
  const [componentLabels, setComponentLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [caseFilter, setCaseFilter] = useState<string>('all')

  const zeroTolerance = useAppStore((s) => s.zeroTolerance)
  const setZeroTolerance = useAppStore((s) => s.setZeroTolerance)
  const kind = KIND_BY_RESULT_TYPE[resultType as keyof typeof KIND_BY_RESULT_TYPE] ?? 'disp'
  const modalTable = isModalTable(resultType)
  const modelNdm = useAppStore((s) => s.model.config?.ndm ?? 2)
  const [modalRows, setModalRows] = useState<ModalRow[]>([])

  const load = () => {
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const { runs: allRuns } = await listRuns()
        if (modalTable) {
          const m0 = Array.from({ length: modelNdm }, () => 0)
          const withModal = allRuns.filter((r) => (r.modalStageCount ?? 0) > 0)
          const rows: ModalRow[] = []
          for (const run of withModal) {
            const { nodeTags, stages } = await queryModal(run.runId)
            for (const stage of stages) {
              let cumulative = m0.map(() => 0)
              stage.modes.forEach((m, i) => {
                const base = { runId: run.runId, stageId: stage.stageId, mode: i + 1 }
                if (resultType === 'modal-periods') rows.push({ ...base, node: null, values: [modePeriod(m.frequency), modeFrequencyHz(m.frequency), m.frequency, m.frequency ** 2] })
                else if (resultType === 'modal-mass') {
                  cumulative = cumulative.map((c, d) => c + (m.massRatio[d] ?? 0))
                  rows.push({ ...base, node: null, values: [...m0.map((_, d) => m.massRatio[d] ?? 0), ...cumulative] })
                } else nodeTags.forEach((tag, n) => {
                  const dofs = Array.from(m.shape.slice(n * stage.ndf, (n + 1) * stage.ndf))
                  rows.push({ ...base, node: tag, values: stage.ndf === 6 ? dofs : [dofs[0], dofs[1], dofs[2]] })
                })
              })
            }
          }
          setModalRows(rows)
          return
        }
        const withData = allRuns.filter((r) => r.sampleCount > 0)
        const results = await Promise.all(withData.map((run) => queryJointDisplacements(run.runId, kind)))
        const nextRows: DisplacementRow[] = []
        let labels: string[] = []
        const stageNames = await Promise.all(withData.map(async (run) => new Map((await getRunLayout(run.runId)).stages.map((st) => [st.stageIndex, st.stageId]))))
        results.forEach((result, i) => {
          const run = withData[i]
          // A case's step 0 is its first sample.
          const firstStep = new Map<number, number>()
          for (const row of result.rows) firstStep.set(row.stageIndex, Math.min(firstStep.get(row.stageIndex) ?? Infinity, row.step))
          if (result.recorders[0] && result.recorders[0].componentLayout.length > labels.length) {
            labels = result.recorders[0].componentLayout
          }
          for (const row of result.rows) {
            nextRows.push({ runId: run.runId, stageId: stageNames[i].get(row.stageIndex) ?? `stage ${row.stageIndex}`, step: row.step - (firstStep.get(row.stageIndex) ?? 0), pseudoTime: row.pseudoTime, node: row.node, values: row.components })
          }
        })
        setRows(nextRows)
        setComponentLabels(labels)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }

  useEffect(() => { setCaseFilter('all'); load() }, [kind, resultType])

  const columns = useMemo<ColumnDef<DisplacementRow>[]>(() => {
    const base: ColumnDef<DisplacementRow>[] = [
      { accessorKey: 'stageId', header: 'Case' },
      { accessorKey: 'step', header: 'Step' },
      { accessorKey: 'pseudoTime', header: 'Time', cell: (c) => c.getValue<number>().toPrecision(5) },
      { accessorKey: 'node', header: TARGET_HEADER[kind] },
    ]
    const dofCols: ColumnDef<DisplacementRow>[] = componentLabels.map((label, i) => ({
      id: `dof-${i}`,
      header: label,
      accessorFn: (row) => row.values[i],
      cell: (c) => {
        const v = c.getValue<number | undefined>()
        return v === undefined ? '' : formatResult(v, zeroTolerance)
      },
    }))
    return [...base, ...dofCols]
  }, [componentLabels, kind, zeroTolerance])

  const modalColumns = useMemo<ColumnDef<ModalRow>[]>(() => [
    { accessorKey: 'stageId', header: 'Case' },
    { accessorKey: 'mode', header: 'Mode' },
    ...(resultType === 'mode-shapes' ? [{ accessorKey: 'node', header: 'Node' } as ColumnDef<ModalRow>] : []),
    ...(isModalTable(resultType) ? modalValueLabels(resultType, modelNdm) : []).map((label, i): ColumnDef<ModalRow> => ({
      id: `v-${i}`,
      header: label,
      accessorFn: (row) => row.values[i],
      cell: (c) => { const v = c.getValue<number | undefined>(); return v === undefined ? '' : formatResult(v, zeroTolerance) },
    })),
  ], [resultType, zeroTolerance, modelNdm])
  const filteredModalRows = useMemo(() => (caseFilter === 'all' ? modalRows : modalRows.filter((r) => r.stageId === caseFilter)), [modalRows, caseFilter])
  const caseIds = useMemo(() => [...new Set((modalTable ? modalRows : rows).map((r) => r.stageId))], [modalTable, modalRows, rows])
  const modalTableInstance = useReactTable({
    data: filteredModalRows,
    columns: modalColumns,
    defaultColumn: { filterFn: columnFilterFn },
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  })

  const filteredRows = useMemo(() => (caseFilter === 'all' ? rows : rows.filter((r) => r.stageId === caseFilter)), [rows, caseFilter])

  const table = useReactTable({
    data: filteredRows,
    columns,
    defaultColumn: { filterFn: columnFilterFn },
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
                <SelectItem key={rt.id} value={rt.id}>{rt.label}</SelectItem>
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
              <SelectItem value="all">All cases ({caseIds.length})</SelectItem>
              {caseIds.map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Filter…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-7 flex-1 text-[11px]" />
          <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground" title="Values smaller than this display as 0">
            Zero tol
            <Input
              key={zeroTolerance}
              defaultValue={String(zeroTolerance)}
              onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setZeroTolerance(v); else e.target.value = String(zeroTolerance) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              className="h-7 w-16 text-[11px]"
            />
          </label>
        </div>
      </div>
      {error && <p className="shrink-0 px-2 py-1 text-[11px] text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        {modalTable
          ? <DataTable table={modalTableInstance} emptyMessage={loading ? 'Loading…' : 'No modal results — run an Eigen Analysis first.'} />
          : <DataTable table={table} emptyMessage={loading ? 'Loading…' : 'No stored results yet — run an analysis first.'} />}
      </div>
    </div>
  )
}
