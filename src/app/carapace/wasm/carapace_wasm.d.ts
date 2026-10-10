/* tslint:disable */
/* eslint-disable */
/**
 * 3-node DKT/Allman shells (3D models only). `nodeIds` has stride 3 (the node order sets the local normal by the
 * right-hand rule); `section` indexes `shellSections`.
 */
export interface Shell3Table {
    nodeIds: number[];
    section: number[];
}

/**
 * 3-node constant-strain triangles (2D models only). `nodeIds` has stride 3
 * (counter-clockwise); `material` indexes `planeMaterials`.
 */
export interface TriangleTable {
    nodeIds: number[];
    thickness: number[];
    material: number[];
    density: number[];
}

/**
 * 4-node MITC4 shells (3D models only). `nodeIds` has stride 4 (the node order fixes the
 * local normal by the right-hand rule); `section` indexes `shellSections`.
 */
export interface Shell4Table {
    nodeIds: number[];
    section: number[];
}

/**
 * 4-node bilinear quadrilaterals (2D models only). `nodeIds` has stride 4
 * (counter-clockwise); `material` indexes `planeMaterials`.
 */
export interface QuadTable {
    nodeIds: number[];
    thickness: number[];
    material: number[];
    density: number[];
    formulation: Quad4FormulationSpec[];
}

/**
 * A `ZeroLength` driven by a coupled `FiberSection` (axial + moment
 * response, `[ux, rz]` in 2D; axial + biaxial moment, `[ux, ry, rz]` in 3D)
 * instead of `ZeroLength`'s independent per-DOF materials — see
 * `core::ZeroLengthSection`'s doc comment.
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
     * an independent spring for a DOF the section has no resultant for: `uy`
     * in 2D; `uy`/`uz` (shear) or `rx` (torsion) in 3D.
     */
    materials: [number, number, number][];
    orient?: OrientRow[];
}

/**
 * A plane (2D continuum) material, referenced by `triangles`/`quads` rows
 * through the `planeMaterials` arena. Strain is `[eps_x, eps_y, gamma_xy]`
 * with engineering shear.
 */
export type PlaneMaterialSpec = { kind: "isotropic"; e: number; nu: number; state: PlaneStateSpec } | { kind: "orthotropic"; ex: number; ey: number; nuXy: number; gXy: number; angle: number } | { kind: "elasticMatrix"; d: [number, number, number, number, number, number] };

/**
 * A shell section, referenced by `shell4s` rows through the `shellSections` arena. Generalized
 * strain and resultants follow OpenSees' `ElasticMembranePlateSection` ordering.
 */
export type ShellSectionSpec = { kind: "elasticMembranePlate"; e: number; nu: number; h: number; rho: number };

/**
 * Every element formulation, 2D and 3D. A kind that does not belong to the
 * model's `ndm` is `DecodeError::ElementKindNotInProfile`.
 */
export type ElementKind = "truss" | "elasticBeamColumn2d" | "elasticBeamColumn3d" | "dispBeamColumn2d" | "dispBeamColumn3d" | "forceBeamColumn2d" | "forceBeamColumn3d" | "zeroLength" | "zeroLengthSection" | "tri3" | "quad4" | "shell3" | "shell4";

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
 * Fibers for every `DispBeamColumn`/`ForceBeamColumn` section, flattened
 * and offset-indexed: section `k` occupies
 * `section_offsets[k]..section_offsets[k + 1]` in `y`/`z`/`area`/`material`.
 * `section_offsets` therefore has `num_sections + 1` entries. `z` is empty in
 * a 2D model and parallel to `y` in a 3D model (biaxial bending) — torsion is
 * deliberately excluded from the fiber loop in `core` (`FiberSection3`'s doc
 * comment) and supplied instead as each owning table's own `g`/`j` fields.
 */
export interface FiberTable {
    sectionOffsets: number[];
    y: number[];
    z?: number[];
    area: number[];
    /**
     * Index into the material arena, parallel to `y`/`area`.
     */
    material: number[];
}

/**
 * General linear multi-point constraints (`core::Domain::add_constraint`):
 * row `i` defines `u[slaveNode[i], slaveDof[i]] = sum coeff * u[node, dof]`
 * over the terms `termOffsets[i]..termOffsets[i + 1]` of the flattened sparse
 * `termNode`/`termDof`/`termCoeff` arrays. `termOffsets` has `rows + 1`
 * entries (or none at all for an empty table).
 */
export interface LinearConstraintTable {
    slaveNode: number[];
    slaveDof: number[];
    termOffsets: number[];
    termNode: number[];
    termDof: number[];
    termCoeff: number[];
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
 * Node table: `coords` stride `ndm` (x, y[, z]); `fixed` one bitmask byte per
 * node (bit `k` = DOF `k`: ux, uy, rz in 2D; ux, uy, uz, rx, ry, rz in 3D);
 * mass is sparse, addressed via a parallel node-index array since most nodes
 * carry none.
 */
export interface NodeTable {
    coords: number[];
    fixed: number[];
    massNodeIndex: number[];
    /**
     * Stride `ndf` (3 in 2D, 6 in 3D), parallel to `mass_node_index`.
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
 * factor. `NodeDisp` was the first variant (node displacement/load-factor
 * history for a static pushover); `ElementForce` (results-storage-indexeddb.md's
 * "several more types of recorders" plan) is the second, sharing the exact
 * same batching/storage machinery — see `session::ResolvedRecorder` and
 * `StepOutcome::recorder_batches`, neither of which needed to change shape
 * to add it. `ElementForce`'s `element_kind`/`element_index` pair mirrors
 * `ElementLoadTable`'s existing disambiguation between per-kind element
 * tables (`ElasticBeamColumn2dTable`, `FiberBeamColumn3dTable`, ...) — there is
 * no single flat element table to index into directly, unlike `NodeTable`.
 * Adding a future response kind (velocity, acceleration, ...) is one more
 * variant here plus one more match arm in `ModelSession::record_sample`,
 * not a new parallel type or a new `Session`/`StepOutcome` field.
 * Which half of a fiber's `(strain, stress)` pair (`core::FiberSection::
 * fiber_responses`'s doc comment) a `RecorderSpec::Fiber` reads — one scalar channel per recorder, same as every other
 * kind here.
 */
export type FiberResponseKind = "strain" | "stress";

/**
 * One sparse `friction` row of [`ZeroLengthTable`]: the row's one `Friction`
 * (2D) / `Friction3` (3D) — see their doc comments for the field meanings.
 * `normal_dof` must already have a `materials` entry on the same row, and the
 * shear DOFs must not (checked by `core` via `debug_assert`).
 */
export interface FrictionRow {
    row: number;
    normalDof: number;
    /**
     * One shear DOF in 2D, two in 3D (coupled to the same normal force).
     */
    shearDofs: number[];
    mu: number;
    k0: number;
    b: number;
}

/**
 * One sparse `orient` row — OpenSees' `-orient x1 x2 x3 [yp1 yp2 yp3]`: local
 * x is `x`; in 3D local z is `x × yp` and local y completes the frame; in 2D
 * `yp` is absent, `x[2]` must be 0 and local y is local x turned 90 degrees
 * counter-clockwise. Every DOF of the row is evaluated along those axes.
 * Rows without an entry use the global axes; at most one entry per row.
 */
export interface OrientRow {
    row: number;
    x: [number, number, number];
    /**
     * Required in 3D, must be absent in 2D.
     */
    yp?: [number, number, number];
}

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
 * Rayleigh damping (`C = alpha_m*M + beta_k*K`) — see
 * `core::RayleighDamping`'s doc comment. Use `alpha_m: 0.0, beta_k: 0.0`
 * for undamped (`core::RayleighDamping::NONE`).
 */
export interface DampingSpec {
    alphaM: number;
    betaK: number;
    /**
     * Resolve these modal anchors from the current domain at transient-stage entry.
     */
    modalAnchors?: ModalDampingAnchors;
}

/**
 * Rigid diaphragm: row `i` ties every node listed against it in
 * `constrained` to `retained[i]` — in 2D the `ux` dof (`core::Domain::
 * rigid_diaphragm`'s doc comment); in 3D the two in-plane translational dofs
 * (perpendicular to `normal[i]`) plus the lever-arm rotation term
 * (`core::Domain3::rigid_diaphragm_about`). `constrained` is sparse per row —
 * `(row, node index)` pairs — since a diaphragm's node count varies.
 * `normal` is 3D only: omitted or empty means every row's normal is Y; a
 * 2D model must leave it empty.
 */
export interface RigidDiaphragmTable {
    retained: number[];
    normal?: Axis3Spec[];
    constrained: [number, number][];
}

/**
 * Rigid links (`core::Domain::rigid_link`'s doc comment): `slave` moves with
 * `master` as a rigid body, small-rotation lever arm taken from the node
 * coordinates.
 */
export interface RigidLinkTable {
    master: number[];
    slave: number[];
}

/**
 * Same fields in 2D and 3D.
 */
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

/**
 * Shared shape for 2D `DispBeamColumn` and `ForceBeamColumn` — both are one
 * prismatic fiber section (see [`FiberTable`]) replicated across
 * integration points by `core`'s own element constructors.
 */
export interface FiberBeamColumn2dTable {
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
 * Shared shape for `DispBeamColumn3` and `ForceBeamColumn3` — both are one
 * prismatic biaxial fiber section (see [`FiberTable`]) replicated across
 * integration points by `core`'s own element constructors. Unlike
 * [`FiberBeamColumn2dTable`], there is no `corotational` field: neither
 * spatial fiber element supports it yet, and no separate `transform` field —
 * `g`/`j`/`vec_xz` are passed directly to the constructor, since these
 * elements only ever use `Linear`-type geometry.
 */
export interface FiberBeamColumn3dTable {
    nodeI: number[];
    nodeJ: number[];
    g: number[];
    /**
     * Torsional constant — fiber sections don't carry torsion (see
     * [`FiberTable`]'s doc comment), so it's supplied here as a decoupled
     * elastic `G*J` term, same as `core::DispBeamColumn3`/`ForceBeamColumn3`.
     */
    j: number[];
    /**
     * A vector not parallel to the member axis, fixing the local y/z
     * orientation — see `core::GeomTransf3::Linear3`'s doc comment.
     */
    vecXz: [number, number, number][];
    /**
     * Index into `FiberTable::section_offsets`.
     */
    fiberSection: number[];
    integration: IntegrationSpec[];
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
     * Model dimension: `2` (`NDM=2`/`NDF=3`) or `3` (`NDM=3`/`NDF=6`).
     * [`decode`] rejects any other value.
     */
    ndm: number;
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
 * The continuation metric's scales (`core::ArcScales`): explicit
 * characteristic translation/rotation/load-factor sizes, or `auto`
 * (translation/rotation scales derived from the first elastic tangent).
 */
export type ArcScalesSpec = { kind: "explicit"; displacement: number; rotation?: number; load: number } | { kind: "auto"; load: number };

/**
 * The full wire payload: header plus one table per entity kind, mirroring
 * `core`'s closed-enum element/material catalog.
 *
 * One format for both profiles (`header.ndm`). Dimension-agnostic entities
 * share a table; formulations that differ between 2D and 3D have a table per
 * formulation (`*2d`/`*3d`), and the other profile's must be empty or
 * omitted ([`DecodeError::TableNotInProfile`]). Every table may be omitted,
 * which is the same as empty.
 */
export interface CarapaceInputV1 {
    header: Header;
    nodes?: NodeTable;
    materials?: MaterialSpec[];
    fibers?: FiberTable;
    trusses?: TrussTable;
    elasticBeamColumns2d?: ElasticBeamColumn2dTable;
    elasticBeamColumns3d?: ElasticBeamColumn3dTable;
    dispBeamColumns2d?: FiberBeamColumn2dTable;
    dispBeamColumns3d?: FiberBeamColumn3dTable;
    forceBeamColumns2d?: FiberBeamColumn2dTable;
    forceBeamColumns3d?: FiberBeamColumn3dTable;
    zeroLengths?: ZeroLengthTable;
    zeroLengthSections?: ZeroLengthSectionTable;
    equalDofs?: EqualDofTable;
    /**
     * Arena of plane materials for `triangles`/`quads` (2D models only).
     */
    planeMaterials?: PlaneMaterialSpec[];
    triangles?: TriangleTable;
    quads?: QuadTable;
    /**
     * Arena of shell sections for `shell4s` (3D models only).
     */
    shellSections?: ShellSectionSpec[];
    shell3s?: Shell3Table;
    shell4s?: Shell4Table;
    rigidDiaphragms?: RigidDiaphragmTable;
    rigidLinks?: RigidLinkTable;
    linearConstraints?: LinearConstraintTable;
    loadPatterns?: LoadPatternTable;
    nodalLoads?: NodalLoadTable;
    elementLoads?: ElementLoadTable;
    sequence?: SequenceSpec;
}

/**
 * Whether a [`RecorderSpec::GaussPoint`] reads strain or stress.
 */
export type GaussQuantity = "strain" | "stress";

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
 * variant style.
 */
export type AnalysisErrorDetail = { kind: "failedToConverge"; step: number } | { kind: "singularSystem" } | { kind: "invalidConstraint" } | { kind: "invalidModeCount"; requested: number; freeDofs: number } | { kind: "invalidOption"; field: string } | { kind: "unsupportedLoadSeries" } | { kind: "zeroLoadSensitivity" } | { kind: "initialStateNotInEquilibrium"; measure: number } | { kind: "missingSeedDirection" } | { kind: "cutbacksExhausted"; step: number; attempts: number; radius: number; lastFailure: ArcFailureDetail } | { kind: "continuationComplete" } | { kind: "invalidModel"; error: ModelErrorDetail };

/**
 * `GeomTransf3`'s wire mirror. No `Corotational3` — spatial corotational
 * geometry doesn't exist in `core` yet (`GeomTransf3`'s own doc comment).
 */
export type TransformSpec3 = { kind: "linear3"; vecXz: [number, number, number] } | { kind: "pDelta3"; vecXz: [number, number, number] };

/**
 * `Serialize`, not `Deserialize` — a `DecodeError` only ever flows *out*
 * to JS (`boundary.rs`), as a `{ kind: "...", ... }`-shaped object.
 */
export type DecodeError = { kind: "invalidAnalysisOption"; stage: string; field: string } | { kind: "unsupportedNdm"; got: number } | { kind: "tableNotInProfile"; table: string } | { kind: "elementKindNotInProfile"; table: string } | { kind: "invalidRecorderComponent"; recorder: number; component: number; width: number } | { kind: "invalidGaussPoint"; recorder: number; point: number; count: number } | { kind: "invalidPlaneMaterial"; index: number; reason: string } | { kind: "invalidShellSection"; index: number; reason: string } | { kind: "invalidRow"; table: string; row: number; reason: string } | { kind: "unknownNodeIndex"; table: string; row: number } | { kind: "unknownMaterialIndex"; table: string; row: number } | { kind: "cyclicMaterialReference"; index: number } | { kind: "unknownPatternIndex"; table: string; row: number } | { kind: "unknownFiberSectionIndex"; row: number } | { kind: "unknownElementIndex"; table: string; row: number } | { kind: "unknownStageIndex"; table: string; row: number } | { kind: "unsupportedElementLoad"; elementKind: string } | { kind: "invalidDof"; table: string; row: number; dof: number } | { kind: "unknownConstraintRow"; table: string; row: number } | { kind: "invalidOrientation"; table: string; row: number } | { kind: "invalidModel"; error: ModelErrorDetail };

/**
 * `Session::modal_results`'s payload: every `Modal` stage that has finished so far, in order.
 */
export interface ModalResultsReport {
    stages: ModalStageResult[];
}

/**
 * `advance`'s result — `{ done, stageComplete, stepsTaken,
 * progressSnapshot, recorderBatch? }`, minus the parts that
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

/**
 * `core::ModelError`, restated for the wire. Node and element indices are
 * the rows of the node table and of the element tables in insertion order
 * (all element kinds in decode order), so a caller can map them back.
 */
export type ModelErrorDetail = { kind: "loadOnInactiveDof"; node: number; dof: number } | { kind: "duplicateSlave"; node: number; dof: number } | { kind: "slaveIsFixed"; node: number; dof: number } | { kind: "constraintCycle"; node: number; dof: number } | { kind: "constraintOnPrescribedDof"; node: number; dof: number } | { kind: "inconsistentInitialState"; node: number; dof: number } | { kind: "massOnConstrainedDof"; node: number; dof: number } | { kind: "incompatibleElementLoad"; element: number } | { kind: "invalidElement"; element: number; reason: string };

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

export interface ElasticBeamColumn2dTable {
    nodeI: number[];
    nodeJ: number[];
    e: number[];
    a: number[];
    iz: number[];
    transform: TransformSpec[];
    density: number[];
}

export interface ElasticBeamColumn3dTable {
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

export interface ModalDampingAnchors {
    mode1: number;
    mode2: number;
    ratio: number;
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
     * core/tests/elements/force_beam.rs's native two-phase test adds its
     * lateral pattern's load only between phases, not upfront).
     */
    stage: number[];
}

export interface SequenceSpec {
    stages: StageSpec[];
    recorders: RecorderSpec[];
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
     * At most one entry per row (`core::ZeroLength` allows only one friction).
     */
    friction?: FrictionRow[];
    orient?: OrientRow[];
}

export type AlgorithmSpec = { kind: "linear" } | { kind: "newton"; tangent?: TangentStrategySpec; lineSearch?: LineSearchSpec } | { kind: "krylovNewton"; tangent: TangentStrategySpec; maxDimension: number };

export type ArcDirectionSpec = "increasing" | "decreasing";

export type ArcPredictorSpec = "secant" | "tangent";

export type ConvergenceSpec = { kind: "normUnbalance"; tol: number; maxIter: number } | { kind: "normDispIncr"; tol: number; maxIter: number } | { kind: "energyIncr"; tol: number; maxIter: number } | { kind: "combined"; forceTol: number; momentTol?: number; relativeTol?: number; displacementTol?: number; maxIter: number };

export type ElementLoadSpec = { kind: "uniform"; wx: number; wy: number; wz?: number } | { kind: "body"; bx: number; by: number } | { kind: "edgeTraction"; edge: number; tx: number; ty: number } | { kind: "edgePressure"; edge: number; pressure: number } | { kind: "shellPressure"; pressure: number } | { kind: "shellBody"; bx: number; by: number; bz: number };

export type IntegrationSpec = { kind: "legendre"; points: number } | { kind: "lobatto"; points: number };

export type IntegratorSpec = { kind: "loadControl"; increment: number } | { kind: "displacementControl"; node: number; dof: number; increment: number } | ({ kind: "arcLength" } & ArcLengthSpec);

export type LineSearchSpec = { kind: "bisection"; tol: number; maxIter: number; maxEta: number } | { kind: "regulaFalsi"; tol: number; maxIter: number; maxEta: number };

export type MaterialProbeError = { kind: "unsupportedMaterial"; material: string } | { kind: "invalidTarget"; target: number } | { kind: "invalidProbe"; reason: string } | { kind: "solverFailure"; target: number; detail: string };

export type PlaneStateSpec = "planeStress" | "planeStrain";

export type Quad4FormulationSpec = "full" | "enhanced";

export type RecorderSpec = { response: "nodeDisp"; node: number; dof: number } | { response: "nodeVel"; node: number; dof: number } | { response: "nodeAccel"; node: number; dof: number } | { response: "elementForce"; elementKind: ElementKind; elementIndex: number; component: number } | { response: "elementLoad"; elementKind: ElementKind; elementIndex: number; component: number } | { response: "modeShape"; mode: number; node: number; dof: number } | { response: "reaction"; node: number; dof: number } | { response: "fiber"; elementKind: ElementKind; elementIndex: number; point: number; fiber: number; quantity: FiberResponseKind } | { response: "gaussPoint"; elementKind: ElementKind; elementIndex: number; point: number; quantity: GaussQuantity; component: number };

export type StageSpec = { kind: "static"; id: string; steps: number; integrator: IntegratorSpec; algorithm: AlgorithmSpec; convergence?: ConvergenceSpec; holdPatternsAfter: number[] } | { kind: "modal"; id: string; modes: number } | { kind: "reset"; id: string } | { kind: "transient"; id: string; steps: number; dt: number; damping: DampingSpec; groundMotions: GroundMotionSpec[]; algorithm?: AlgorithmSpec; convergence?: ConvergenceSpec };

export type StopReasonDetail = "displacementTarget" | "loadFactorTarget" | "loadFactorZeroCrossing" | "chordLength" | "stepCount";

export type TangentStrategySpec = "current" | "reuseAtStepStart" | "initial";

export type TimeSeriesSpec = { kind: "constant" } | { kind: "linear"; slope: number } | { kind: "path"; times: number[]; factors: number[] } | { kind: "boundedPath"; times: number[]; factors: number[]; useLast: boolean };

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

export function createMaterialProbe(config: MaterialProbeConfig): WasmMaterialProbe;

/**
 * Decodes a `CarapaceInputV1`-shaped JS value (see `input_v1`'s table
 * doc comments for the exact field names — `#[serde(rename_all =
 * "camelCase")]` throughout) into a steppable [`WasmSession`]. Rejects
 * with a `{ kind: "...", ... }`-shaped JS error object on any
 * [`input_v1::DecodeError`], the same tagged shape a Rust caller would
 * match on.
 */
export function decodeInput(value: CarapaceInputV1): WasmSession;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmmaterialprobe_free: (a: number, b: number) => void;
    readonly __wbg_wasmsession_free: (a: number, b: number) => void;
    readonly createMaterialProbe: (a: any) => [number, number, number];
    readonly decodeInput: (a: any) => [number, number, number];
    readonly wasmmaterialprobe_applyStrain: (a: number, b: number) => [number, number, number];
    readonly wasmmaterialprobe_reset: (a: number) => [number, number];
    readonly wasmsession_advance: (a: number, b: number) => [number, number, number];
    readonly wasmsession_currentStageId: (a: number) => [number, number];
    readonly wasmsession_modalResults: (a: number) => [number, number, number];
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
