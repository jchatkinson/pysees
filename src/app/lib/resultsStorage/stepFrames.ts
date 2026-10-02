import { getRunLayout, queryBlock, queryRunExtents } from './resultsStorageClient'
import type { RecorderKind, RecorderMetadata, ResultBlock, RunExtents, RunMetadata } from '@/app/types/resultsStorage'

const MAX_CACHED_BLOCKS = 8

/** Where each recorded target's columns sit in a dense step row (row index 0 is pseudoTime). */
export interface RunLayout {
  run: RunMetadata
  stride: number
  /** `kind` -> target tag (node or element) -> first row index and the recorder's component labels. */
  columns: Record<RecorderKind, Map<number, { offset: number; labels: string[] }>>
}

export interface StepFrame {
  step: number
  pseudoTime: number
  /** The step's full dense row, a view into the cached block — don't hold it across `evict`. */
  row: Float64Array
}

function buildLayout(run: RunMetadata, recorders: RecorderMetadata[]): RunLayout {
  const columns: RunLayout['columns'] = { disp: new Map(), reaction: new Map(), force: new Map() }
  for (const rec of recorders) {
    const kind = rec.kind ?? 'disp'
    const tag = Number(rec.recorderId.replace(/^[a-z]+:/, ''))
    columns[kind].set(tag, { offset: 1 + (rec.columnOffset ?? rec.nodeIndex * run.dofsPerNode), labels: rec.componentLayout })
  }
  return { run, stride: 1 + (run.columnCount ?? run.nodeCount * run.dofsPerNode), columns }
}

/**
 * Main-thread access to one run's steps. Blocks are fetched from the storage worker on demand and
 * kept in a small LRU, so stepping or playing through a run costs one fetch per block. `peek` is
 * the synchronous path for per-frame use (null until `get`/`prefetch` has loaded the block).
 */
export class StepFrameSource {
  readonly runId: string
  readonly layout: RunLayout
  private blocks = new Map<number, ResultBlock>() // blockIndex -> block, insertion order = LRU order
  private inflight = new Map<number, Promise<ResultBlock | null>>()
  private extentsPromise: Promise<RunExtents> | null = null

  private constructor(runId: string, layout: RunLayout) {
    this.runId = runId
    this.layout = layout
  }

  static async open(runId: string): Promise<StepFrameSource | null> {
    const { run, recorders } = await getRunLayout(runId)
    return run ? new StepFrameSource(runId, buildLayout(run, recorders)) : null
  }

  get sampleCount(): number { return this.layout.run.sampleCount }

  private cached(step: number): ResultBlock | null {
    for (const [index, block] of this.blocks) {
      if (step >= block.firstSample && step < block.firstSample + block.sampleCount) {
        this.blocks.delete(index) // refresh LRU position
        this.blocks.set(index, block)
        return block
      }
    }
    return null
  }

  private frameFrom(block: ResultBlock, step: number): StepFrame {
    const { stride } = this.layout
    const row = new Float64Array(block.data, (step - block.firstSample) * stride * 8, stride)
    return { step, pseudoTime: row[0], row }
  }

  /** The step's frame if its block is already loaded, else null. */
  peek(step: number): StepFrame | null {
    const block = this.cached(step)
    return block ? this.frameFrom(block, step) : null
  }

  async get(step: number): Promise<StepFrame | null> {
    const hit = this.peek(step)
    if (hit) return hit
    if (step < 0 || step >= this.sampleCount) return null
    const block = await (this.inflight.get(step) ?? this.fetchBlock(step))
    return block && step >= block.firstSample && step < block.firstSample + block.sampleCount ? this.frameFrom(block, step) : null
  }

  /** Warm the cache for `step` and the `ahead` steps after it. Sequential, so each block is fetched once. */
  prefetch(step: number, ahead = 0): void {
    void (async () => {
      for (let s = step; s <= Math.min(step + ahead, this.sampleCount - 1); s++) if (!this.cached(s)) await this.get(s)
    })().catch(() => { /* a failed prefetch just means the later `get` retries */ })
  }

  private fetchBlock(step: number): Promise<ResultBlock | null> {
    const request = queryBlock(this.runId, step).then(({ block }) => {
      if (block) {
        this.blocks.set(block.blockIndex, block)
        while (this.blocks.size > MAX_CACHED_BLOCKS) this.blocks.delete(this.blocks.keys().next().value as number)
      }
      return block
    }).finally(() => this.inflight.delete(step))
    this.inflight.set(step, request)
    return request
  }

  /** Whole-run max |value| per kind/label, computed once — what autoscale reads. */
  extents(): Promise<RunExtents> {
    return (this.extentsPromise ??= queryRunExtents(this.runId).then((r) => r.extents))
  }
}
