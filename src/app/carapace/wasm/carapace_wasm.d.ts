/* tslint:disable */
/* eslint-disable */
/**
 * A `ZeroLength3` driven by a coupled `FiberSection3` (axial + biaxial
 * moment response, `[ux, ry, rz]`) instead of `ZeroLength3`'s independent
 * per-DOF materials — see `core::ZeroLengthSection3`'s doc comment.
 */
export interface ZeroLengthSectionTable3 {
    nodeI: number[];
    nodeJ: number[];
    /**
     * Index into `FiberTable3::section_offsets`.
     */
    fiberSection: number[];
    /**
     * Sparse `(zero_length_section row index, dof, material arena index)` —
     * an independent spring for a DOF the section doesn't drive: `uy`/`uz`
     * (shear, dofs 1/2) or `rx` (torsion, dof 3).
     */
    materials: [number, number, number][];
    /**
     * Sparse `(row, x1, x2, x3, yp1, yp2, yp3)` — OpenSees' `-orient`: local x
     * is `x`, local z is `x × yp`, local y completes the frame, and every DOF
     * of the row is evaluated along those axes. Rows without an entry use
     * the global axes; at most one entry per row.
     */
    orient?: [number, number, number, number, number, number, number][];
}

/**
 * A `ZeroLength` driven by a coupled `FiberSection` (axial + moment
 * response, `[ux, rz]`) instead of `ZeroLength`'s independent per-DOF
 * materials — see `core::ZeroLengthSection`'s doc comment.
 */
export interface ZeroLengthSectionTable {
    nodeI: number[];
    nodeJ: number[];
    /**
     * Index into `FiberTable::section_offsets`.
     */
    fiberSection: number[];
    /**
     * Sparse `(zero_length_section row index, dof, material arena index)` —
     * an independent spring for the one DOF (`uy`) the section has no
     * resultant for.
     */
    materials: [number, number, number][];
    /**
     * Sparse `(row, x1, x2, x3)` — OpenSees' 2D `-orient x1 x2 x3`: local x is
     * `(x1, x2)` (`x3` must be 0) and local y is local x turned 90 degrees
     * counter-clockwise; every DOF of the row is evaluated along those axes.
     * Rows without an entry use the global axes; at most one entry per row.
     */
    orient?: [number, number, number, number][];
}

/**
 * Accepts the original bare strings and configurable algorithm objects.
 */
export type AlgorithmSpec = LegacyAlgorithmSpec | AlgorithmConfigSpec;

/**
 * Everything a finished `Modal` stage computed.
 */
export interface ModalStageResult {
    stageIndex: number;
    stageId: string;
    /**
     * DOFs per node (the stride of `ModeResult::shape`).
     */
    ndf: number;
    modes: ModeResult[];
    /**
     * `r_d^T M r_d` per translation direction `d`: the mass the mass ratios are relative to.
     */
    totalMass: number[];
}

/**
 * Fibers for every `DispBeamColumn3`/`ForceBeamColumn3` section, flattened
 * and offset-indexed exactly like [`super::tables::FiberTable`], but with
 * both `y` and `z` coordinates (biaxial bending) — torsion is deliberately
 * excluded from the fiber loop in `core` (`FiberSection3`'s doc comment)
 * and supplied instead as each owning table's own `g`/`j` fields.
 */
export interface FiberTable3 {
    sectionOffsets: number[];
    y: number[];
    z: number[];
    area: number[];
    /**
     * Index into the material arena, parallel to `y`/`z`/`area`.
     */
    material: number[];
}

/**
 * Fibers for every `DispBeamColumn`/`ForceBeamColumn` section, flattened
 * and offset-indexed: section `k` occupies
 * `section_offsets[k]..section_offsets[k + 1]` in `y`/`area`/`material`.
 * `section_offsets` therefore has `num_sections + 1` entries.
 */
export interface FiberTable {
    sectionOffsets: number[];
    y: number[];
    area: number[];
    /**
     * Index into the material arena, parallel to `y`/`area`.
     */
    material: number[];
}

/**
 * Identity multi-point constraints (`core::Domain::equal_dof`'s doc
 * comment): row `i` ties `constrained[i]`'s dofs listed in `dofs` exactly
 * to the same dofs of `retained[i]`. `dofs` is sparse per row — `(row,
 * dof)` pairs, mirroring `ZeroLengthTable::materials`'s own sparse
 * convention — since most ties only ever list one or two dofs, not every
 * dof a node has.
 */
export interface EqualDofTable {
    retained: number[];
    constrained: number[];
    dofs: [number, number][];
}

/**
 * Node table: `coords` stride 2 (x, y); `fixed` one bitmask byte per node
 * (bit 0 = ux, bit 1 = uy, bit 2 = rz); mass is sparse, addressed via a
 * parallel node-index array since most nodes carry none.
 */
export interface NodeTable {
    coords: number[];
    fixed: number[];
    massNodeIndex: number[];
    /**
     * Stride 3 (mass_x, mass_y, mass_rz), parallel to `mass_node_index`.
     */
    mass: number[];
}

/**
 * Node table: `coords` stride 3 (x, y, z); `fixed` one bitmask byte per
 * node (bit 0..5 = ux, uy, uz, rx, ry, rz, matching `SpatialDof`'s order);
 * mass is sparse, addressed via a parallel node-index array since most
 * nodes carry none.
 */
export interface NodeTable3 {
    coords: number[];
    fixed: number[];
    massNodeIndex: number[];
    /**
     * Stride 6 (mass_ux, mass_uy, mass_uz, mass_rx, mass_ry, mass_rz),
     * parallel to `mass_node_index`.
     */
    mass: number[];
}

/**
 * One `core::GroundMotion`: a uniform acceleration time history applied
 * along one global translational axis (`direction`: `0`=x, `1`=y, and for
 * the spatial profile `2`=z — never a rotational DOF). `series` is
 * typically `TimeSeriesSpec::Path` (the accelerogram itself), reusing the
 * same wire type a static `LoadPatternTable` entry uses — an accelerogram
 * is exactly a piecewise-linear series, no separate representation needed
 * (`core::GroundMotion`'s own doc comment).
 */
export interface GroundMotionSpec {
    direction: number;
    series: TimeSeriesSpec;
    scaleFactor: number;
}

/**
 * One arena entry. Composite variants reference other entries by their
 * `u32` index into the same arena, resolved by [`resolve_materials`].
 */
export type MaterialSpec = { kind: "elastic"; e: number } | { kind: "elasticPp"; e: number; eyp: number } | { kind: "gap"; e: number; gap: number } | { kind: "ent"; e: number } | { kind: "steel01"; fy: number; e0: number; b: number; a1: number; a2: number; a3: number; a4: number } | { kind: "concrete01"; fpc: number; epsc0: number; fpcu: number; epscu: number } | { kind: "steel02"; fy: number; e0: number; b: number; r0: number; cr1: number; cr2: number; a1: number; a2: number; a3: number; a4: number } | { kind: "concrete02"; fc: number; epsc0: number; fcu: number; epscu: number; rat: number; ft: number; ets: number } | { kind: "parallel"; children: [number, number][] } | { kind: "series"; children: number[] } | { kind: "minMax"; inner: number; minStrain: number; maxStrain: number } | { kind: "hysteretic"; mom1p: number; rot1p: number; mom2p: number; rot2p: number; mom3p: number; rot3p: number; mom1n: number; rot1n: number; mom2n: number; rot2n: number; mom3n: number; rot3n: number; pinchX: number; pinchY: number; damfc1: number; damfc2: number; beta: number } | { kind: "pinching4"; stress1p: number; strain1p: number; stress2p: number; strain2p: number; stress3p: number; strain3p: number; stress4p: number; strain4p: number; stress1n: number; strain1n: number; stress2n: number; strain2n: number; stress3n: number; strain3n: number; stress4n: number; strain4n: number; rDispP: number; rForceP: number; uForceP: number; rDispN: number; rForceN: number; uForceN: number; gammaKParams: [number, number, number, number]; gammaKLimit: number; gammaDParams: [number, number, number, number]; gammaDLimit: number; gammaFParams: [number, number, number, number]; gammaFLimit: number; gammaE: number; dmgCyc: Pinching4DmgCycSpec };

/**
 * One component of a seed direction: `node`/`dof` index into `NodeTable`.
 */
export interface ArcSeedComponentSpec {
    node: number;
    dof: number;
    value: number;
}

/**
 * One computed mode of a finished `Modal` stage. `shape` is node-major over every node in the
 * input's node-table order (`shape[node * ndf + dof]`, fixed DOFs `0.0`), M-normalized and
 * sign-fixed so its largest-magnitude entry is positive. `participation[d]` is the modal
 * participation factor `phi^T M r_d` for global translation direction `d`, and `mass_ratio[d]`
 * the effective modal mass `participation^2` as a fraction of `ModalStageResult::total_mass[d]`.
 */
export interface ModeResult {
    /**
     * Natural circular frequency, rad/time.
     */
    frequency: number;
    shape: number[];
    participation: number[];
    massRatio: number[];
}

/**
 * One recorder's new samples from a single `advance()` call. `first_sample` plus
 * `samples.len()` gives the sample range this batch covers, so a caller can retry a failed
 * persist without renumbering — the "each `advance()` batch deterministic and identifies its
 * first sample/count" contract from results-storage-indexeddb.md's "Failure and cancellation
 * contract". Scalar-only (`(pseudo_time, value)` pairs, one channel) until a vector recorder
 * needs more.
 */
export interface RecorderBatch {
    recorderIndex: number;
    stageIndex: number;
    firstSample: number;
    samples: [number, number][];
}

/**
 * One recorder: a single scalar channel's history against its stage's load
 * factor. `NodeDisp` was M10's first (and, until now, only) variant
 * (pysees-handoff.md's "selected node displacement/load-factor history for
 * the static pushover"); `ElementForce` (results-storage-indexeddb.md's
 * "several more types of recorders" plan) is the second, sharing the exact
 * same batching/storage machinery — see `session::ResolvedRecorder` and
 * `StepOutcome::recorder_batches`, neither of which needed to change shape
 * to add it. `ElementForce`'s `element_kind`/`element_index` pair mirrors
 * `ElementLoadTable`'s existing disambiguation between per-kind element
 * tables (`ElasticBeamColumnTable`, `ForceBeamColumnTable`, ...) — there is
 * no single flat element table to index into directly, unlike `NodeTable`.
 * Adding a future response kind (velocity, acceleration, ...) is one more
 * variant here plus one more match arm in `PlanarSession::record_sample`,
 * not a new parallel type or a new `Session`/`StepOutcome` field.
 * Which half of a fiber's `(strain, stress)` pair (`core::FiberSection::
 * fiber_responses`'s doc comment) a `RecorderSpec::Fiber`/`RecorderSpec3::
 * Fiber` reads — one scalar channel per recorder, same as every other
 * kind here.
 */
export type FiberResponseKind = "strain" | "stress";

/**
 * Optional criteria that end an arc-length stage before its step cap.
 */
export interface ArcStopSpec {
    displacement?: DisplacementTargetSpec;
    loadFactor?: LoadFactorTargetSpec;
    loadFactorZeroCrossing?: boolean;
    maxChordLength?: number;
}

/**
 * Planar rigid diaphragm (`core::Domain::rigid_diaphragm`'s doc comment):
 * row `i` ties every node listed against it in `constrained`'s own `ux`
 * dof to `retained[i]`'s `ux`. `constrained` is sparse per row — `(row,
 * node index)` pairs — since a diaphragm's node count varies per instance.
 */
export interface RigidDiaphragmTable {
    retained: number[];
    constrained: [number, number][];
}

/**
 * Rayleigh damping (`C = alpha_m*M + beta_k*K`) — see
 * `core::RayleighDamping`'s doc comment. Use `alpha_m: 0.0, beta_k: 0.0`
 * for undamped (`core::RayleighDamping::NONE`).
 */
export interface DampingSpec {
    alphaM: number;
    betaK: number;
}

/**
 * Shared shape for `DispBeamColumn3` and `ForceBeamColumn3` — both are one
 * prismatic biaxial fiber section (see [`FiberTable3`]) replicated across
 * integration points by `core`'s own element constructors. Unlike
 * [`super::tables::FiberBeamColumnTable`], there is no `corotational`
 * field: neither spatial fiber element supports it yet (`core`'s
 * `DispBeamColumn3`/`ForceBeamColumn3` expose no `.with_corotational()`),
 * and no separate `transform` field — `g`/`j`/`vec_xz` are passed directly
 * to the constructor rather than wrapped in a `GeomTransf3`, since these
 * elements only ever use `Linear`-type geometry.
 */
export interface FiberBeamColumnTable3 {
    nodeI: number[];
    nodeJ: number[];
    g: number[];
    /**
     * Torsional constant — fiber sections don't carry torsion (see
     * [`FiberTable3`]'s doc comment), so it's supplied here as a decoupled
     * elastic `G*J` term, same as `core::DispBeamColumn3`/`ForceBeamColumn3`.
     */
    j: number[];
    /**
     * A vector not parallel to the member axis, fixing the local y/z
     * orientation — see `core::GeomTransf3::Linear3`'s doc comment.
     */
    vecXz: [number, number, number][];
    /**
     * Index into `FiberTable3::section_offsets`.
     */
    fiberSection: number[];
    integration: IntegrationSpec[];
    density: number[];
}

/**
 * Shared shape for `DispBeamColumn` and `ForceBeamColumn` — both are one
 * prismatic fiber section (see [`FiberTable`]) replicated across
 * integration points by `core`'s own element constructors.
 */
export interface FiberBeamColumnTable {
    nodeI: number[];
    nodeJ: number[];
    /**
     * Index into `FiberTable::section_offsets`.
     */
    fiberSection: number[];
    integration: IntegrationSpec[];
    corotational: boolean[];
    density: number[];
}

/**
 * Small structured-clone header fields — everything else in
 * `CarapaceInputV1` is a bulk table.
 */
export interface Header {
    /**
     * The wire format's own version, independent of `engine_version`.
     */
    schemaVersion: number;
    /**
     * `2` (planar, `NDM=2`/`NDF=3`) or `3` (spatial, `NDM=3`/`NDF=6`).
     * [`decode`] rejects any other value.
     */
    space: number;
    /**
     * `carapace-core`'s version, recorded for run provenance.
     */
    engineVersion: string;
    /**
     * Record one sample of every supported recorder at the start of each `Static`/`Transient`
     * stage, before its first step (the stage's initial conditions, at load factor/time `0`).
     * Off by default: every stage's samples are then only the ones its steps produce.
     */
    recordInitial?: boolean;
}

/**
 * Spatial counterpart to [`super::tables::EqualDofTable`] — same shape,
 * dofs range `0..6` instead of `0..3`.
 */
export interface EqualDofTable3 {
    retained: number[];
    constrained: number[];
    dofs: [number, number][];
}

/**
 * Spatial rigid diaphragm (`core::Domain3::rigid_diaphragm_about`'s doc
 * comment): row `i` ties every node listed against it in `constrained`'s
 * two in-plane translational dofs (perpendicular to `normal[i]`) to
 * `retained[i]`'s same in-plane translations plus the lever-arm rotation
 * term. `constrained` is sparse per row, same convention as
 * [`super::tables::RigidDiaphragmTable`].
 */
export interface RigidDiaphragmTable3 {
    retained: number[];
    normal: Axis3Spec[];
    constrained: [number, number][];
}

/**
 * The continuation metric's scales (`core::ArcScales`): explicit
 * characteristic translation/rotation/load-factor sizes, or `auto`
 * (translation/rotation scales derived from the first elastic tangent).
 */
export type ArcScalesSpec = { kind: "explicit"; displacement: number; rotation?: number; load: number } | { kind: "auto"; load: number };

/**
 * The full wire payload: header plus one table per (profile, entity-kind)
 * pair, mirroring `core`'s closed-enum element/material catalog.
 *
 * Every table is always present, possibly empty (the handoff's per-table
 * "presence directory" isn't modeled yet — see `tables.rs`'s module doc
 * comment), including the `*3` spatial tables when `header.space == 2` and
 * vice versa: `decode` only ever reads the table set matching
 * `header.space`, ignoring the other profile's tables entirely.
 * `materials`/`load_patterns`/`nodal_loads` are dimension-agnostic and so
 * are shared by both profiles rather than duplicated as `materials3`/etc.
 */
export interface CarapaceInputV1 {
    header: Header;
    nodes: NodeTable;
    materials: MaterialSpec[];
    fibers: FiberTable;
    trusses: TrussTable;
    elasticBeamColumns: ElasticBeamColumnTable;
    dispBeamColumns: FiberBeamColumnTable;
    forceBeamColumns: FiberBeamColumnTable;
    zeroLengths: ZeroLengthTable;
    zeroLengthSections: ZeroLengthSectionTable;
    equalDofs: EqualDofTable;
    rigidDiaphragms: RigidDiaphragmTable;
    loadPatterns: LoadPatternTable;
    nodalLoads: NodalLoadTable;
    elementLoads: ElementLoadTable;
    sequence: SequenceSpec;
    nodes3: NodeTable3;
    fibers3: FiberTable3;
    trusses3: TrussTable3;
    elasticBeamColumns3: ElasticBeamColumnTable3;
    dispBeamColumns3: FiberBeamColumnTable3;
    forceBeamColumns3: FiberBeamColumnTable3;
    zeroLengths3: ZeroLengthTable3;
    zeroLengthSections3: ZeroLengthSectionTable3;
    equalDofs3: EqualDofTable3;
    rigidDiaphragms3: RigidDiaphragmTable3;
    /**
     * Nodal loads for the spatial profile reuse [`NodalLoadTable`] as-is —
     * `(pattern, node, dof, value)` needs nothing profile-specific, `dof`
     * simply ranges up to 5 instead of 2.
     */
    nodalLoads3: NodalLoadTable;
    elementLoads3: ElementLoadTable3;
    sequence3: SequenceSpec3;
}

/**
 * Wire form of `core::ArcLength`. Omitted `minRadius`/`maxRadius` default
 * to `initialRadius` (a fixed-radius run).
 */
export interface ArcLengthSpec {
    initialRadius: number;
    minRadius?: number;
    maxRadius?: number;
    targetIterations?: number;
    maxRetries?: number;
    direction?: ArcDirectionSpec;
    scales: ArcScalesSpec;
    predictor?: ArcPredictorSpec;
    seed?: ArcSeedSpec;
    arcTolerance?: number;
    correctionTolerance?: number;
    backtracking?: BacktrackingSpec;
    stop?: ArcStopSpec;
}

/**
 * Wire-format mirror of `core::Pinching4DmgCyc` (which carries no `serde`
 * derives of its own — `core` stays free of any wasm/serde awareness, see
 * `decode.rs`'s module doc comment).
 */
export type Pinching4DmgCycSpec = "energyBased" | "cycleBased";

/**
 * `AnalysisError`'s fields, restated so `advance`'s result doesn't need to
 * name `carapace_core`'s error type directly — kept in the same tagged-
 * variant style (implementation-plan.md §2.8).
 */
export type AnalysisErrorDetail = { kind: "failedToConverge"; step: number } | { kind: "singularSystem" } | { kind: "invalidConstraint" } | { kind: "invalidModeCount"; requested: number; freeDofs: number } | { kind: "invalidOption"; field: string } | { kind: "unsupportedLoadSeries" } | { kind: "zeroLoadSensitivity" } | { kind: "initialStateNotInEquilibrium"; measure: number } | { kind: "missingSeedDirection" } | { kind: "cutbacksExhausted"; step: number; attempts: number; radius: number; lastFailure: ArcFailureDetail } | { kind: "continuationComplete" };

/**
 * `GeomTransf3`'s wire mirror. No `Corotational3` — spatial corotational
 * geometry doesn't exist in `core` yet (`GeomTransf3`'s own doc comment).
 */
export type TransformSpec3 = { kind: "linear3"; vecXz: [number, number, number] } | { kind: "pDelta3"; vecXz: [number, number, number] };

/**
 * `RecorderSpec`'s spatial counterpart — same shape, just `element_kind`
 * naming a spatial [`ElementKind3`] and `component` indexing a width-12
 * (`2 * SPATIAL_NDF`) local nodal force vector instead of width-6. `Node`
 * disp is otherwise dimension-agnostic (`dof` just goes up to 5 instead of
 * 2), but a shared enum would need `RecorderSpec::ElementForce` to name a
 * type that's different per profile, so this stays its own enum rather
 * than a generic parameter.
 */
export type RecorderSpec3 = { response: "nodeDisp"; node: number; dof: number } | { response: "nodeVel"; node: number; dof: number } | { response: "nodeAccel"; node: number; dof: number } | { response: "elementForce"; elementKind: ElementKind3; elementIndex: number; component: number } | { response: "elementLoad"; elementKind: ElementKind3; elementIndex: number; component: number } | { response: "modeShape"; mode: number; node: number; dof: number } | { response: "reaction"; node: number; dof: number } | { response: "fiber"; elementKind: ElementKind3; elementIndex: number; point: number; fiber: number; quantity: FiberResponseKind };

/**
 * `SequenceSpec`'s spatial counterpart. `stages: Vec<StageSpec>` is reused
 * verbatim — stage/integrator/algorithm/convergence compilation
 * (`decode.rs`'s `compile_stages`) never touches element physics, only
 * node indices and DOF numbers, so nothing about it is planar-specific.
 */
export interface SequenceSpec3 {
    stages: StageSpec[];
    recorders: RecorderSpec3[];
}

/**
 * `Serialize`, not `Deserialize` — a `DecodeError` only ever flows *out*
 * to JS (`boundary.rs`), as a `{ kind: "...", ... }`-shaped object.
 */
export type DecodeError = { kind: "invalidAnalysisOption"; stage: string; field: string } | { kind: "unsupportedSpace"; got: number } | { kind: "unknownNodeIndex"; table: string; row: number } | { kind: "unknownMaterialIndex"; table: string; row: number } | { kind: "cyclicMaterialReference"; index: number } | { kind: "unknownPatternIndex"; table: string; row: number } | { kind: "unknownFiberSectionIndex"; row: number } | { kind: "unknownElementIndex"; table: string; row: number } | { kind: "unknownStageIndex"; table: string; row: number } | { kind: "unsupportedElementLoad"; elementKind: string } | { kind: "invalidDof"; table: string; row: number; dof: number } | { kind: "unknownConstraintRow"; table: string; row: number } | { kind: "invalidOrientation"; table: string; row: number };

/**
 * `Session::modal_results`'s payload: every `Modal` stage that has finished so far, in order.
 */
export interface ModalResultsReport {
    stages: ModalStageResult[];
}

/**
 * `advance`'s result — pysees-handoff.md's `{ done, stageComplete,
 * stepsTaken, progressSnapshot, recorderBatch? }`, minus the parts that
 * are the worker/JS boundary's job (`progressSnapshot`'s throttling,
 * `recorderBatch`'s `response_blocks` byte layout): `load_factor` here is
 * the raw signal those would be built from — for a `Static` stage the
 * integrator's load factor, for a `Transient` stage the elapsed time
 * (`TransientAnalysis::time`), and for a `Modal` stage always `0.0` (a
 * single eigensolve has no comparable incremental progress scalar; read
 * `Mode::frequency` from a `ModeShape` recorder's batch instead). `error`,
 * once set, is sticky — later stages are not attempted, matching "a
 * stage's `AnalysisError` stops the sequence".
 */
export interface StepOutcome {
    done: boolean;
    stageComplete: boolean;
    stepsTaken: number;
    loadFactor: number;
    error: AnalysisErrorDetail | undefined;
    /**
     * Diagnostics of the last accepted arc-length step this call took
     * (radius, retries, solves, chord length, determinant sign, stop
     * criterion), or `None` when it took none. With arc length the load
     * factor can decrease and repeat, so samples are ordered by their
     * sample index, never by load factor.
     */
    continuation: ContinuationDetail | undefined;
    /**
     * Only the samples *this* `advance()` call produced, one entry per recorder that recorded
     * at least one sample this call (every recorder samples every step today, so in practice
     * this is either empty — no step taken — or has one entry per recorder). This is the
     * results-storage plan's (docs/results-storage-indexeddb.md) `recorderBatch`, restated in
     * field names that match pysees's frozen `ResultBlock` protocol type
     * (`src/app/types/resultsStorage.ts`); the caller assigns `blockIndex` and packs `data`,
     * since neither concept exists on this side of the wasm boundary.
     */
    recorderBatches: RecorderBatch[];
}

/**
 * `core::ArcFailure`, restated for the wire.
 */
export type ArcFailureDetail = "notConverged" | "stagnated" | "noDescent" | "nonFinite" | "singularSystem" | "inaccurateSolve" | "branchOrientation" | "degenerateConstraint";

/**
 * `core::ArcStepInfo` for the last accepted arc-length step of an
 * `advance()` call (`StepOutcome::continuation`).
 */
export interface ContinuationDetail {
    radius: number;
    nextRadius: number;
    retries: number;
    correctorSolves: number;
    factorizations: number;
    forceMeasure: number;
    arcError: number;
    chordLength: number;
    detSign: number | undefined;
    bifurcationSuspected: boolean;
    displacementScale: number;
    rotationScale: number | undefined;
    stop: ContinuationStopDetail | undefined;
}

/**
 * `core::Axis3`'s wire mirror — core's own type carries no `serde` derive
 * (`Axis3`'s doc comment: it's a plain `repr(usize)` enum for internal
 * indexing, not wire-facing), so this is decode's own translation, the
 * same reason `TransformSpec`/`TransformSpec3` mirror `GeomTransf`/
 * `GeomTransf3` rather than deriving on the `core` type directly.
 */
export type Axis3Spec = "x" | "y" | "z";

export interface ArcSeedSpec {
    components: ArcSeedComponentSpec[];
    load?: number;
}

export interface BacktrackingSpec {
    armijo: number;
    minStep: number;
}

export interface ContinuationStopDetail {
    reason: StopReasonDetail;
    landedExactly: boolean;
    overshoot: number;
}

export interface DisplacementTargetSpec {
    node: number;
    dof: number;
    value: number;
    exact?: boolean;
}

export interface ElasticBeamColumnTable {
    nodeI: number[];
    nodeJ: number[];
    e: number[];
    a: number[];
    iz: number[];
    transform: TransformSpec[];
    density: number[];
}

export interface ElasticBeamColumnTable3 {
    nodeI: number[];
    nodeJ: number[];
    e: number[];
    g: number[];
    a: number[];
    /**
     * Torsional constant.
     */
    j: number[];
    iy: number[];
    iz: number[];
    transform: TransformSpec3[];
    density: number[];
}

export interface ElementLoadTable {
    pattern: number[];
    elementKind: ElementKind[];
    /**
     * Row index into the table named by the parallel `element_kind` entry.
     */
    elementIndex: number[];
    load: ElementLoadSpec[];
    /**
     * See [`NodalLoadTable::stage`] — same per-stage registration timing.
     */
    stage: number[];
}

export interface ElementLoadTable3 {
    pattern: number[];
    elementKind: ElementKind3[];
    /**
     * Row index into the table named by the parallel `element_kind` entry.
     */
    elementIndex: number[];
    load: ElementLoadSpec3[];
    /**
     * See [`super::tables::NodalLoadTable::stage`] — same per-stage
     * registration timing.
     */
    stage: number[];
}

export interface LoadFactorTargetSpec {
    value: number;
    exact?: boolean;
}

export interface LoadPatternTable {
    series: TimeSeriesSpec[];
    scaleFactor: number[];
}

export interface MaterialProbeConfig {
    material: MaterialSpec;
    initialStrain?: number | undefined;
}

export interface MaterialProbeResponse {
    strain: number;
    stress: number;
}

export interface NodalLoadTable {
    /**
     * Index into `LoadPatternTable`.
     */
    pattern: number[];
    /**
     * Index into `NodeTable`.
     */
    node: number[];
    dof: number[];
    value: number[];
    /**
     * Index into `SequenceSpec::stages`: this load is only registered on
     * the `Domain` when that stage starts, not at decode time. This
     * matters whenever an earlier stage's `LoadControl` shares one
     * pseudo-time with every unfrozen pattern (core/src/analysis/
     * integrator.rs) — a pattern's reference load must not exist yet if
     * an earlier stage isn't meant to ramp it too (the same reason
     * core/tests/m8_force_beam_column.rs's native two-phase test adds its
     * lateral pattern's load only between phases, not upfront).
     */
    stage: number[];
}

export interface SequenceSpec {
    stages: StageSpec[];
    recorders: RecorderSpec[];
}

export interface TrussTable {
    nodeI: number[];
    nodeJ: number[];
    area: number[];
    /**
     * Index into the material arena.
     */
    material: number[];
    density: number[];
}

export interface TrussTable3 {
    nodeI: number[];
    nodeJ: number[];
    area: number[];
    /**
     * Index into the material arena.
     */
    material: number[];
    density: number[];
}

export interface ZeroLengthTable {
    nodeI: number[];
    nodeJ: number[];
    /**
     * Sparse `(zero_length row index, dof, material arena index)` — most
     * DOFs on a given `ZeroLength` carry no material at all.
     */
    materials: [number, number, number][];
    /**
     * Sparse `(zero_length row index, normal_dof, shear_dof, mu, k0, b)` —
     * at most one entry per row (`core::ZeroLength` allows only one
     * `Friction`); see `Friction`'s doc comment for the field meanings.
     * `normal_dof` must already have a `materials` entry on the same row,
     * and `shear_dof` must not (checked by `core` via `debug_assert`).
     */
    friction: [number, number, number, number, number, number][];
    /**
     * Sparse `(row, x1, x2, x3)` — OpenSees' 2D `-orient x1 x2 x3`: local x is
     * `(x1, x2)` (`x3` must be 0) and local y is local x turned 90 degrees
     * counter-clockwise; every DOF of the row is evaluated along those axes.
     * Rows without an entry use the global axes; at most one entry per row.
     */
    orient?: [number, number, number, number][];
}

export interface ZeroLengthTable3 {
    nodeI: number[];
    nodeJ: number[];
    /**
     * Sparse `(zero_length row index, dof, material arena index)` — most
     * DOFs on a given `ZeroLength3` carry no material at all.
     */
    materials: [number, number, number][];
    /**
     * Sparse `(zero_length row index, normal_dof, shear_dof_0, shear_dof_1,
     * mu, k0, b)` — at most one entry per row (`core::ZeroLength3` allows
     * only one `Friction3`, which independently couples *two* shear DOFs
     * to the same normal force; see `Friction3`'s doc comment).
     */
    friction: [number, number, number, number, number, number, number][];
    /**
     * Sparse `(row, x1, x2, x3, yp1, yp2, yp3)` — OpenSees' `-orient`: local x
     * is `x`, local z is `x × yp`, local y completes the frame, and every DOF
     * of the row is evaluated along those axes. Rows without an entry use
     * the global axes; at most one entry per row.
     */
    orient?: [number, number, number, number, number, number, number][];
}

export type AlgorithmConfigSpec = { kind: "linear" } | { kind: "newton"; tangent?: TangentStrategySpec; lineSearch?: LineSearchSpec } | { kind: "krylovNewton"; tangent: TangentStrategySpec; maxDimension: number };

export type ArcDirectionSpec = "increasing" | "decreasing";

export type ArcPredictorSpec = "secant" | "tangent";

export type ConvergenceSpec = { kind: "normUnbalance"; tol: number; maxIter: number } | { kind: "normDispIncr"; tol: number; maxIter: number } | { kind: "energyIncr"; tol: number; maxIter: number } | { kind: "combined"; forceTol: number; momentTol?: number; relativeTol?: number; displacementTol?: number; maxIter: number };

export type ElementKind = "truss" | "elasticBeamColumn" | "dispBeamColumn" | "forceBeamColumn" | "zeroLength" | "zeroLengthSection";

export type ElementKind3 = "truss" | "elasticBeamColumn" | "dispBeamColumn" | "forceBeamColumn" | "zeroLength" | "zeroLengthSection";

export type ElementLoadSpec = { kind: "uniform"; wx: number; wy: number };

export type ElementLoadSpec3 = { kind: "uniform"; wx: number; wy: number; wz: number };

export type IntegrationSpec = { kind: "legendre"; points: number } | { kind: "lobatto"; points: number };

export type IntegratorSpec = { kind: "loadControl"; increment: number } | { kind: "displacementControl"; node: number; dof: number; increment: number } | ({ kind: "arcLength" } & ArcLengthSpec);

export type LegacyAlgorithmSpec = "linear" | "newtonRaphson";

export type LineSearchSpec = { kind: "bisection"; tol: number; maxIter: number; maxEta: number } | { kind: "regulaFalsi"; tol: number; maxIter: number; maxEta: number };

export type MaterialProbeError = { kind: "unsupportedMaterial"; material: string } | { kind: "invalidTarget"; target: number } | { kind: "invalidProbe"; reason: string } | { kind: "solverFailure"; target: number; detail: string };

export type RecorderSpec = { response: "nodeDisp"; node: number; dof: number } | { response: "nodeVel"; node: number; dof: number } | { response: "nodeAccel"; node: number; dof: number } | { response: "elementForce"; elementKind: ElementKind; elementIndex: number; component: number } | { response: "elementLoad"; elementKind: ElementKind; elementIndex: number; component: number } | { response: "modeShape"; mode: number; node: number; dof: number } | { response: "reaction"; node: number; dof: number } | { response: "fiber"; elementKind: ElementKind; elementIndex: number; point: number; fiber: number; quantity: FiberResponseKind };

export type StageSpec = { kind: "static"; id: string; steps: number; integrator: IntegratorSpec; algorithm: AlgorithmSpec; convergence?: ConvergenceSpec; holdPatternsAfter: number[] } | { kind: "modal"; id: string; modes: number } | { kind: "reset"; id: string } | { kind: "transient"; id: string; steps: number; dt: number; damping: DampingSpec; groundMotions: GroundMotionSpec[]; algorithm?: AlgorithmSpec; convergence?: ConvergenceSpec };

export type StopReasonDetail = "displacementTarget" | "loadFactorTarget" | "loadFactorZeroCrossing" | "chordLength" | "stepCount";

export type TangentStrategySpec = "current" | "reuseAtStepStart" | "initial";

export type TimeSeriesSpec = { kind: "constant" } | { kind: "linear"; slope: number } | { kind: "path"; times: number[]; factors: number[] };

export type TransformSpec = "linear" | "pDelta" | "corotational";


/**
 * Opaque handle to a persistent uniaxial material probe (`material_probe`).
 * Material state persists across `applyStrain` calls; cancel between points
 * by simply not calling it again.
 */
export class WasmMaterialProbe {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Imposes the strain and returns `{ strain, stress }`; rejects with a
     * `{ kind, ... }` `MaterialProbeError`.
     */
    applyStrain(target: number): MaterialProbeResponse;
    reset(): void;
}

/**
 * Opaque handle to a decoded, steppable analysis session — the `Session`
 * enum itself can't cross the boundary directly, since `wasm_bindgen`
 * requires an exported type to be a plain struct.
 */
export class WasmSession {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * See `input_v1::Session::advance`. Returns a `{ done, stageComplete, stepsTaken,
     * loadFactor, error, recorderBatches }` object — `recorderBatches` holds only the samples
     * this call produced (results-storage-indexeddb.md's `recorderBatch`, one entry per
     * recorder that recorded this call), not the whole run's history. There is no separate
     * "samples so far" accessor: a caller that needs the full history accumulates these
     * batches itself, same as the planned results-storage worker will.
     */
    advance(step_budget: number): StepOutcome;
    /**
     * The `AnalysisSequence` stage id `advance` is currently in (or, once
     * done, whichever stage stopped it) — `undefined` once every stage has
     * completed.
     */
    currentStageId(): string | undefined;
    /**
     * Frequencies, mode shapes and participation of every `Modal` stage finished so far
     * (`{ stages: ModalStageResult[] }`); empty until a modal stage completes. Read it after
     * `advance` reports `done`, or whenever a stage has completed.
     */
    modalResults(): ModalResultsReport;
}

export function axial_displacement(load: number, length: number, area: number, modulus: number): number;

/**
 * Same 2-node truss case as `axial_displacement`, but computed through the
 * real `Domain`/`Element::Truss`/`Analysis` architecture (M1) rather than
 * the closed-form placeholder — see implementation-plan.md M1 acceptance
 * criteria. Kept alongside the M0 export for wasm/Node verification.
 */
export function axial_displacement_via_analysis(load: number, length: number, area: number, modulus: number): number;

export function createMaterialProbe(config: MaterialProbeConfig): WasmMaterialProbe;

/**
 * M6 wiring check: Newmark + Rayleigh-damped SDOF free vibration, closed
 * form `u(t) = exp(-xi*omega*t) * u0 * [cos(omega_d*t) +
 * (xi*omega/omega_d)*sin(omega_d*t)]` — see `core/tests/m6_dynamics.rs`
 * for the native equivalent and derivation. Returns the displacement
 * after `steps` steps of size `dt`.
 */
export function damped_sdof_free_vibration_displacement(steps: number, dt: number): number;

/**
 * Decodes a `CarapaceInputV1`-shaped JS value (see `input_v1`'s table
 * doc comments for the exact field names — `#[serde(rename_all =
 * "camelCase")]` throughout) into a steppable [`WasmSession`]. Rejects
 * with a `{ kind: "...", ... }`-shaped JS error object on any
 * [`input_v1::DecodeError`], the same tagged shape a Rust caller would
 * match on.
 */
export function decodeInput(value: CarapaceInputV1): WasmSession;

/**
 * M7 stage-1 wiring check: a `DispBeamColumn` (fiber-discretized,
 * displacement-based) cantilever with a 2-fiber elastic section that
 * reproduces `E*A`/`E*Iz` exactly — must match `ElasticBeamColumn`'s
 * closed-form tip deflection exactly, not approximately. See
 * `core/tests/m7_disp_beam_column.rs` for the native equivalent.
 */
export function disp_beam_column_cantilever_tip_deflection(e: number, area: number, iz: number, length: number, tip_load: number): number;

/**
 * M5 wiring check: the 2-DOF "1-1-1-1" mass-spring chain's natural
 * frequencies, closed form `1/phi` and `phi` (golden ratio) — see
 * `core/tests/m5_modal.rs` for the native equivalent and derivation.
 * Returns `[omega1, omega2]`.
 */
export function mass_spring_chain_frequencies(): Float64Array;

/**
 * M4 wiring check: a `Truss` (elastic) in parallel with a `ZeroLength`+
 * `ElasticPP` (elastic-perfectly-plastic) spring, loaded past the EPP
 * spring's yield point within a single step — needs `Algorithm::Newton`'s
 * iteration to resolve correctly (`Algorithm::Linear`'s one-shot solve
 * can't cross a material regime boundary within a step).
 * See `core/tests/m4_analysis.rs` for the native equivalent and the
 * closed-form derivation.
 */
export function newton_raphson_elastic_plastic_displacement(force: number): number;

/**
 * M3 wiring check: a simply-supported `ElasticBeamColumn` under a uniform
 * transverse element load, returning the node_i end rotation — closed form
 * `theta = w*L^3/(24*E*I)`. See `core/tests/m3_beam.rs` for the native
 * equivalent and why a single element is exact here.
 */
export function simply_supported_beam_end_rotation(e: number, iz: number, area: number, length: number, w: number): number;

/**
 * M2 wiring check: a `ZeroLength` + `Material::Ent` ("no tension")
 * connector under a compressive load, computed through the same real
 * architecture — proves the `Element`/`Material` enum dispatch generalizes
 * beyond `Truss`/`Elastic` on wasm32 + Node, not just natively (see
 * `core/tests/m2_zero_length.rs` for the native-side equivalent and the
 * single-linear-regime caveat this test shares with it).
 */
export function zero_length_ent_displacement(load: number, modulus: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmmaterialprobe_free: (a: number, b: number) => void;
    readonly __wbg_wasmsession_free: (a: number, b: number) => void;
    readonly axial_displacement: (a: number, b: number, c: number, d: number) => number;
    readonly axial_displacement_via_analysis: (a: number, b: number, c: number, d: number) => number;
    readonly createMaterialProbe: (a: any) => [number, number, number];
    readonly damped_sdof_free_vibration_displacement: (a: number, b: number) => number;
    readonly decodeInput: (a: any) => [number, number, number];
    readonly disp_beam_column_cantilever_tip_deflection: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly mass_spring_chain_frequencies: () => [number, number];
    readonly newton_raphson_elastic_plastic_displacement: (a: number) => number;
    readonly simply_supported_beam_end_rotation: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly wasmmaterialprobe_applyStrain: (a: number, b: number) => [number, number, number];
    readonly wasmmaterialprobe_reset: (a: number) => [number, number];
    readonly wasmsession_advance: (a: number, b: number) => [number, number, number];
    readonly wasmsession_currentStageId: (a: number) => [number, number];
    readonly wasmsession_modalResults: (a: number) => [number, number, number];
    readonly zero_length_ent_displacement: (a: number, b: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
