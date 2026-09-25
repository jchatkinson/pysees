// Frozen wire protocol between the analysis worker and the results-storage worker, and the
// schema the storage worker persists to IndexedDB (db `pysees-results`). Mirrors
// carapace/docs/results-storage-indexeddb.md's "IndexedDB layout" and "Cross-worker protocol"
// sections exactly — keep both in sync, do not fork the shape here without updating that doc.
// `interrupted` is written only by the storage worker's startup reconciliation pass (see
// "Interrupted runs" in that doc), never sent over this protocol by a caller.
//
// Every recorded node always captures its full displacement vector (no per-recorder DOF
// selection — every node/disp recorder just requests every DOF), so every recorded node has the
// same width (`dofsPerNode`, the model's `ndf`). That makes the run's `responseBlocks` a single
// dense time-major layout per run — no per-recorder blocks, no offset table: sample row stride is
// `1 + nodeCount * dofsPerNode` (`[pseudoTime, node0.dof0..dof(D-1), node1.dof0.., ...]`), and a
// given node's columns start at `1 + nodeIndex * dofsPerNode`. This is what lets "give me every
// node's displacement at time T" (deformed-shape scrubbing, the hot path) be a single row fetch
// instead of one fetch per node; a single node's time-history instead scans the run's blocks and
// slices its own columns out of each row.

export type RunStatus = 'running' | 'complete' | 'failed' | 'cancelled' | 'storage-failed' | 'interrupted'

// runs(runId)
export interface RunMetadata {
  runId: string
  modelHash: string
  sequenceHash: string
  schemaVersion: number
  engineVersion: string
  startedAt: number
  completedAt?: number
  status: RunStatus
  finalStageId?: string
  errorDetail?: string
  storageFailureDetail?: string
  /** The model's ndf — every recorded node's fixed component width. */
  dofsPerNode: number
  /** Number of recorded nodes; the dense per-step row is `1 + nodeCount * dofsPerNode` wide. */
  nodeCount: number
  /** Samples committed so far — shared across every node, since they're recorded on one timeline. */
  sampleCount: number
}

// stages([runId, stageIndex])
export interface StageMetadata {
  runId: string
  stageIndex: number
  stageId: string
  kind: string
  status: 'pending' | 'running' | 'complete' | 'failed'
}

// recorders([runId, recorderId]). One row per recorded node — recorderId is that node's tag
// (as a string). `nodeIndex` is this node's position in the dense per-step row.
export interface RecorderMetadata {
  runId: string
  recorderId: string
  nodeIndex: number
  componentLayout: string[]
}

// responseBlocks([runId, blockIndex]) — one row per chunk, covering every recorded node.
export interface ResultBlock {
  blockIndex: number
  firstSample: number
  sampleCount: number
  stageIndex: number
  /** Transferred, not cloned, between workers. Row-major Float64, stride
   * `1 + nodeCount * dofsPerNode` per sample (nodeCount/dofsPerNode from the run's RunMetadata). */
  data: ArrayBuffer
}

export interface ResultSample {
  pseudoTime: number
  /** One recorder's own `dofsPerNode` values, sliced out of the dense row. */
  components: number[]
}

export type StorageRequest =
  | { type: 'beginRun'; requestId: string; run: RunMetadata; stages: StageMetadata[]; recorders: RecorderMetadata[] }
  | { type: 'writeBlocks'; requestId: string; runId: string; batchId: string; blocks: ResultBlock[] }
  | { type: 'query'; requestId: string; runId: string; recorderId: string; firstSample?: number; limit?: number }
  | { type: 'finishRun'; requestId: string; runId: string; status: 'complete' | 'failed' | 'cancelled' | 'storage-failed'; detail?: string }
  | { type: 'deleteRun'; requestId: string; runId: string }

// Every reply carries the requestId of the StorageRequest it answers. `storageError` can be
// sent in place of any other reply for the same requestId when the underlying transaction fails.
export type StorageReply =
  | { type: 'beginRunAck'; requestId: string; runId: string }
  | { type: 'writeBlocksAck'; requestId: string; runId: string; batchId: string; committedBlockKeys: [runId: string, blockIndex: number][]; committedSampleCount: number }
  | { type: 'queryResult'; requestId: string; runId: string; recorderId: string; samples: ResultSample[]; nextFirstSample?: number }
  | { type: 'finishRunAck'; requestId: string; runId: string; status: RunStatus }
  | { type: 'deleteRunAck'; requestId: string; runId: string }
  | { type: 'storageError'; requestId: string; runId: string; detail: string }
