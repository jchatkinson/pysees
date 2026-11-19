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
 * A force applied to a bar end through a load pattern: `force` (N) is the tension it puts in the bar (outward along the bar's tangent).
 */
export interface BarEndLoadSpec {
    /**
     * Index into `LoadPatternTable`.
     */
    pattern: number;
    /**
     * Index into `SequenceSpec::stages`, as `NodalLoadTable::stage`; omitted is the first stage.
     */
    stage?: number;
    force: number;
}

/**
 * A host element: `kind` is `tri3` or `quad4`, `index` its row in that kind's table.
 */
export interface HostElementSpec {
    kind: ElementKind;
    index: number;
}

/**
 * A plane (2D continuum) material, referenced by `triangles`/`quads` rows
 * through the `planeMaterials` arena. Strain is `[eps_x, eps_y, gamma_xy]`
 * with engineering shear.
 */
export type PlaneMaterialSpec = { kind: "isotropic"; e: number; nu: number; state: PlaneStateSpec } | { kind: "orthotropic"; ex: number; ey: number; nuXy: number; gXy: number; angle: number } | { kind: "elasticMatrix"; d: [number, number, number, number, number, number] } | { kind: "csfmConcrete"; fck: number; ecm?: number; law: CsfmConcreteLawSpec; softening: boolean; tensileRegularization?: number };

/**
 * A probe material, referenced by fibers by its position in `SectionProbeConfig::materials`.
 */
export type ProbeMaterialSpec = { kind: "core"; index: number } | { kind: "combine"; terms: [number, number][] } | ({ kind: "concrete" } & ConcreteSpec) | ({ kind: "steel" } & SteelSpec) | ({ kind: "general" } & GeneralSpec);

/**
 * A shell section, referenced by `shell3s` and `shell4s` rows through the `shellSections` arena. Generalized
 * strain and resultants follow OpenSees' `ElasticMembranePlateSection` ordering.
 */
export type ShellSectionSpec = { kind: "elasticMembranePlate"; e: number; nu: number; h: number; rho: number; modifiers?: ShellModifiersSpec };

/**
 * An anchorage end spring: yield force `fau` (N), elastic stiffness `ka` (N/mm), hardening `ksn * ka`.
 */
export interface AnchorageSpringWire {
    fau: number;
    ka: number;
    /**
     * Omitted is the book's `1e-2`.
     */
    ksn?: number;
}

/**
 * CalcsApp concrete laws (`materialModels.js`). Magnitudes are used; signs of `fc`, `ec`, `ecu` are ignored.
 */
export interface ConcreteSpec {
    model: ConcreteModel;
    fc: number;
    ec: number;
    ecu: number;
    /**
     * Strain at the end of the post-crush descent; defaults to `ecu`.
     */
    eu?: number | undefined;
    /**
     * Residual stress magnitude at `eu`.
     */
    fu?: number;
    /**
     * Whitney stress-block factor.
     */
    alpha?: number;
    /**
     * Whitney beta1; the block starts at `ecu * (1 - beta1)`. Required for `whitney`.
     */
    beta1?: number | undefined;
    tensionCapacity?: boolean;
    ft?: number;
    ets?: number;
    /**
     * `[strain, stress]` pairs for `userCurve`.
     */
    curvePoints?: [number, number][];
    dropAfterLastPoint?: boolean;
}

/**
 * Compression envelope of a `csfmConcrete` plane material.
 */
export type CsfmConcreteLawSpec = "parabolaRectangle" | "elasticIdeallyPlastic";

/**
 * ETABS-style stiffness modifiers on a shell section; each omitted factor is `1`. `f11 f22 f12` scale the
 * membrane terms, `m11 m22 m12` the bending terms and `v13 v23` the transverse shear (no effect on `shell3s`).
 * Every factor must be finite and positive.
 */
export interface ShellModifiersSpec {
    f11?: number;
    f22?: number;
    f12?: number;
    m11?: number;
    m22?: number;
    m12?: number;
    v13?: number;
    v23?: number;
}

/**
 * Every element formulation, 2D and 3D. A kind that does not belong to the
 * model's `ndm` is `DecodeError::ElementKindNotInProfile`.
 */
export type ElementKind = "truss" | "elasticBeamColumn2d" | "elasticBeamColumn3d" | "dispBeamColumn2d" | "dispBeamColumn3d" | "forceBeamColumn2d" | "forceBeamColumn3d" | "zeroLength" | "zeroLengthSection" | "tri3" | "quad4" | "shell3" | "shell4" | "embeddedBar";

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
 * Factored resultants and the factors behind them.
 */
export interface FactoredResponse {
    response: SectionResponse;
    /**
     * `phi` for [`Factoring::Aci`].
     */
    phi: number | undefined;
    /**
     * Largest tensile strain of the bar group for [`Factoring::Aci`] (zero if none is in tension).
     */
    epsT: number | undefined;
}

/**
 * Fibers as parallel arrays (`y`, `z`, `area`, `material`, optional `group`).
 */
export interface ProbeFibers {
    y: number[];
    z: number[];
    area: number[];
    /**
     * Index into `SectionProbeConfig::materials`.
     */
    material: number[];
    /**
     * Group id per fiber (for per-group force sums, e.g. concrete vs steel resistance factors). Defaults to
     * group 0 for every fiber.
     */
    group?: number[];
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
 * Maximum compressive and tensile axial force over uniform strain (zero curvature), and the strain where each
 * occurs. The compressive one is the concentric capacity `P0` and is generally interior to the crushing-limited
 * PMM boundary; its moment is non-zero when the section is not symmetric about its centroid.
 */
export interface AxialExtremes {
    compression: AxialExtreme;
    tension: AxialExtreme;
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
 * One `embeddedBars` row's segments. Results are indexed `(bar, segment)`: the segment `s` of
 * bar `b` is element `embeddedBar` index `firstSegment + s`.
 */
export interface EmbeddedBarGroup {
    firstSegment: number;
    segments: EmbeddedBarSegment[];
    /**
     * `Some` only for a `csfmRebar` material.
     */
    routing?: RebarRouting;
    /**
     * Crack spacing `sr` (mm; `0` for POM). `Some` only for a `csfmRebar` material.
     */
    sr?: number;
    /**
     * Present when the bar has a `bond` spec: where each bar point went.
     */
    bond?: BondGroup;
}

/**
 * One arena entry. Composite variants reference other entries by their
 * `u32` index into the same arena, resolved by [`resolve_materials`].
 */
export type MaterialSpec = { kind: "elastic"; e: number } | { kind: "elasticPp"; e: number; eyp: number } | { kind: "gap"; e: number; gap: number } | { kind: "ent"; e: number } | { kind: "steel01"; fy: number; e0: number; b: number; a1: number; a2: number; a3: number; a4: number } | { kind: "concrete01"; fpc: number; epsc0: number; fpcu: number; epscu: number } | { kind: "steel02"; fy: number; e0: number; b: number; r0: number; cr1: number; cr2: number; a1: number; a2: number; a3: number; a4: number } | { kind: "concrete02"; fc: number; epsc0: number; fcu: number; epscu: number; rat: number; ft: number; ets: number } | { kind: "parallel"; children: [number, number][] } | { kind: "series"; children: number[] } | { kind: "minMax"; inner: number; minStrain: number; maxStrain: number } | { kind: "csfmRebar"; es: number; fy: number; ft: number; epsU: number; fctm: number; ecm: number; diameter: number; rhoEff: number; lambda: number; tensionStiffening: boolean } | { kind: "hysteretic"; mom1p: number; rot1p: number; mom2p: number; rot2p: number; mom3p: number; rot3p: number; mom1n: number; rot1n: number; mom2n: number; rot2n: number; mom3n: number; rot3n: number; pinchX: number; pinchY: number; damfc1: number; damfc2: number; beta: number } | { kind: "pinching4"; stress1p: number; strain1p: number; stress2p: number; strain2p: number; stress3p: number; strain3p: number; stress4p: number; strain4p: number; stress1n: number; strain1n: number; stress2n: number; strain2n: number; stress3n: number; strain3n: number; stress4n: number; strain4n: number; rDispP: number; rForceP: number; uForceP: number; rDispN: number; rForceN: number; uForceN: number; gammaKParams: [number, number, number, number]; gammaKLimit: number; gammaDParams: [number, number, number, number]; gammaDLimit: number; gammaFParams: [number, number, number, number]; gammaFLimit: number; gammaE: number; dmgCyc: Pinching4DmgCycSpec };

/**
 * One bulk recorder's output over the accepted steps of one `advance` call. `values` holds
 * `progress.len()` consecutive frames of `elements * points * components` numbers each, in
 * element, then point, then component order (element = table row, or flat segment index for
 * `embeddedBars`); `progress[i]` is frame `i`'s load factor or time.
 */
export interface BulkBatch {
    recorderIndex: number;
    stageIndex: number;
    firstSample: number;
    elements: number;
    points: number;
    components: number;
    /**
     * A `Float64Array` across the wasm boundary (the `advance` binding moves it, not a
     * `number[]`), so a worker can transfer its buffer.
     */
    progress: Float64Array;
    /**
     * A `Float64Array` across the wasm boundary, like `progress`.
     */
    values: Float64Array;
}

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
 * One discretized piece of an embedded bar, in the undeformed configuration.
 */
export interface EmbeddedBarSegment {
    /**
     * `[x, y]` of the segment start, in the bar's drawing direction.
     */
    start: [number, number];
    end: [number, number];
    length: number;
    /**
     * The host element's kind (`tri3` or `quad4`).
     */
    hostKind: ElementKind;
    /**
     * The host's nodes as `nodes` table rows, in the host's own node order.
     */
    hostNodes: number[];
}

/**
 * One embedded rebar (2D models only): a polyline `[x0, y0, x1, y1, ...]` (mm) discretized
 * against the `triangles`/`quads` it runs through, one `embeddedBar` element per piece. `area`
 * is the bar's cross-section (mm^2) and `material` indexes `materials` (a `csfmRebar` for CSFM).
 */
export interface EmbeddedBarSpec {
    polyline: number[];
    area: number;
    material: number;
    /**
     * The continuum elements the bar may embed in; omitted is `"all"`.
     */
    hosts?: EmbeddedBarHostsSpec;
    /**
     * Bond-slip model (ULS): the bar slips against the concrete through bond springs at its discretization
     * points. Omitted: perfect bond (the bar strain is the host displacement field projected on it).
     */
    bond?: BondSpecWire;
    /**
     * The first point of the polyline is anchored beyond the mesh: the bar is held along its tangent there (its force goes to
     * that restraint, not into the concrete) and follows the concrete normal to it. No bond or anchorage spring acts at that end.
     */
    anchoredStart?: boolean;
    /**
     * The last point of the polyline is anchored beyond the mesh, as `anchoredStart`.
     */
    anchoredEnd?: boolean;
    /**
     * A force on the first end of the bar (a rod node: needs a `bond` spec or an anchored other end), pulling it outward along the bar.
     */
    startLoad?: BarEndLoadSpec;
    /**
     * A force on the last end of the bar, as `startLoad`.
     */
    endLoad?: BarEndLoadSpec;
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
    /**
     * Stop when the controlling material-limit utilization reaches `1` (CSFM crushing or rebar
     * rupture, optionally tightened by user strain limits).
     */
    materialLimit?: MaterialLimitSpec;
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
 * Section resultants at one strain state.
 */
export interface SectionResponse {
    n: number;
    mz: number;
    my: number;
    /**
     * `-mz`
     */
    m2: number;
    /**
     * `my`
     */
    m3: number;
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
 * The bond-slip discretization of one bar: one entry per bar point, in polyline order (segment `s` joins
 * points `s` and `s + 1`).
 */
export interface BondGroup {
    points: BondPointInfo[];
}

/**
 * The continuation metric's scales (`core::ArcScales`): explicit
 * characteristic translation/rotation/load-factor sizes, or `auto`
 * (translation/rotation scales derived from the first elastic tangent).
 */
export type ArcScalesSpec = { kind: "explicit"; displacement: number; rotation?: number; load: number } | { kind: "auto"; load: number };

/**
 * The controlling material-limit utilization at one recorded sample, under the always-on limits
 * (concrete crushing at `|eps_cu2| = 0.0035` and rebar rupture; the optional strain limits are
 * only applied by `stop.materialLimit`). `utilization >= 1` means the limit is reached. The
 * location is element-level: `elementKind` and `elementIndex` are the row in that kind's table
 * (the flat segment index for `embeddedBar`; `modelOutput` maps it to `(bar, segment)`).
 */
export interface LimitSample {
    progress: number;
    utilization: number;
    kind: LimitKindDetail;
    elementKind: ElementKind;
    elementIndex: number;
}

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
     * Rebar polylines embedded in the `triangles`/`quads` continuum (2D models only), one row
     * per bar. Each is discretized into `embeddedBar` segments; see `ModelOutput`.
     */
    embeddedBars?: EmbeddedBarSpec[];
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
 * What a [`RecorderSpec::Bulk`] reads. `strain`/`stress`/`principalStrain`/`principalStress`/`kc2`
 * mean the same as [`GaussQuantity`] (on `triangles`/`quads`; `strain` and `stress` also on
 * `embeddedBars`, one value per segment); `axialForce` and `ruptured` are
 * [`EmbeddedBarQuantity`]'s and belong to `embeddedBars` only.
 */
export type BulkQuantity = "strain" | "stress" | "principalStrain" | "principalStress" | "kc2" | "axialForce" | "ruptured" | "displacement" | "reaction" | "deformation" | "force";

/**
 * What a [`RecorderSpec::EmbeddedBar`] reads.
 */
export type EmbeddedBarQuantity = "axialForce" | "strain" | "stress" | "ruptured";

/**
 * What one accepted `Static` step cost.
 */
export interface StepDiagnostic {
    /**
     * The load factor (or arc-length continuation parameter) the step ended at.
     */
    progress: number;
    /**
     * Newton iterations of the accepted attempt (corrector solves under arc length).
     */
    iterations: number;
    /**
     * Tangent factorizations over the step, failed attempts included.
     */
    factorizations: number;
    /**
     * Present under `loadControlCutbacks` only.
     */
    cutback: CutbackDetail | undefined;
}

/**
 * Whether a [`RecorderSpec::GaussPoint`] reads strain or stress.
 */
export type GaussQuantity = "strain" | "stress" | "principalStrain" | "principalStress" | "kc2";

/**
 * Which average-strain model a `csfmRebar` bar's effective reinforcement ratio routed to.
 */
export type RebarRouting = "tcm" | "pom";

/**
 * Which element table a [`RecorderSpec::Bulk`] records.
 */
export type BulkTable = "triangles" | "quads" | "embeddedBars" | "nodes" | "zeroLengths";

/**
 * Which material limit controls (`core::LimitKind`).
 */
export type LimitKindDetail = "concreteCrushing" | "concreteTensileStrain" | "rebarRupture" | "rebarStrainLimit" | "bondSlip" | "anchorageSlip";

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
 * Wire form of `core::MaterialLimitTarget`. The target is always utilization `1`. With
 * `exact` the bracketing step is retaken so the stage ends on it. The optional strain limits
 * (positive, finite) are `core::LimitStateConfig`'s: without them only the always-on limits
 * are checked, i.e. concrete crushing at `|eps_cu2| = 0.0035` and rebar rupture.
 */
export interface MaterialLimitSpec {
    exact?: boolean;
    /**
     * Replaces the default crushing strain limit `0.0035`.
     */
    concreteCrushingLimit?: number;
    /**
     * Enables the concrete tensile-strain limit (`eps_1 / limit`).
     */
    concreteTensileLimit?: number;
    /**
     * Enables a user rebar strain limit (`|eps| / limit`).
     */
    rebarStrainLimit?: number;
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
export type AnalysisErrorDetail = { kind: "failedToConverge"; step: number } | { kind: "singularSystem" } | { kind: "invalidConstraint" } | { kind: "invalidModeCount"; requested: number; freeDofs: number } | { kind: "invalidOption"; field: string } | { kind: "unsupportedLoadSeries" } | { kind: "zeroLoadSensitivity" } | { kind: "initialStateNotInEquilibrium"; measure: number } | { kind: "missingSeedDirection" } | { kind: "cutbacksExhausted"; step: number; attempts: number; radius: number; lastFailure: ArcFailureDetail } | { kind: "continuationComplete" } | { kind: "invalidModel"; error: ModelErrorDetail } | { kind: "loadControlExhausted"; step: number; acceptedLoadFactor: number };

/**
 * `GeomTransf3`'s wire mirror. No `Corotational3` — spatial corotational
 * geometry doesn't exist in `core` yet (`GeomTransf3`'s own doc comment).
 */
export type TransformSpec3 = { kind: "linear3"; vecXz: [number, number, number] } | { kind: "pDelta3"; vecXz: [number, number, number] };

/**
 * `Serialize`, not `Deserialize` — a `DecodeError` only ever flows *out*
 * to JS (`boundary.rs`), as a `{ kind: "...", ... }`-shaped object.
 */
export type DecodeError = { kind: "invalidAnalysisOption"; stage: string; field: string } | { kind: "unsupportedNdm"; got: number } | { kind: "tableNotInProfile"; table: string } | { kind: "elementKindNotInProfile"; table: string } | { kind: "invalidRecorderComponent"; recorder: number; component: number; width: number } | { kind: "invalidGaussPoint"; recorder: number; point: number; count: number } | { kind: "invalidEmbeddedBarSegment"; recorder: number; bar: number; segment: number; count: number } | { kind: "recorderNotApplicable"; recorder: number; reason: string } | { kind: "invalidPlaneMaterial"; index: number; reason: string } | { kind: "invalidMaterial"; index: number; reason: string } | { kind: "invalidShellSection"; index: number; reason: string } | { kind: "invalidRow"; table: string; row: number; reason: string } | { kind: "unknownNodeIndex"; table: string; row: number } | { kind: "unknownMaterialIndex"; table: string; row: number } | { kind: "cyclicMaterialReference"; index: number } | { kind: "unknownPatternIndex"; table: string; row: number } | { kind: "unknownFiberSectionIndex"; row: number } | { kind: "unknownElementIndex"; table: string; row: number } | { kind: "unknownStageIndex"; table: string; row: number } | { kind: "unsupportedElementLoad"; elementKind: string } | { kind: "invalidDof"; table: string; row: number; dof: number } | { kind: "unknownConstraintRow"; table: string; row: number } | { kind: "invalidOrientation"; table: string; row: number } | { kind: "invalidModel"; error: ModelErrorDetail };

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
    /**
     * This call's `bulk` recorder output, one entry per bulk recorder that recorded a step.
     */
    bulkBatches: BulkBatch[];
    /**
     * For a `Static` stage whose model has a CSFM limit state (any `csfmConcrete` or `csfmRebar`):
     * one entry per sample the stage recorded this call (every accepted step, plus the initial
     * state with `header.recordInitial`), naming the controlling material-limit utilization and
     * where it is. Always empty for a model with no limit state or for other stage kinds.
     */
    limitHistory: LimitSample[];
    /**
     * For a `Static` stage: one entry per step this call took, in order, with the solver work it
     * cost. They line up with the frames of `bulkBatches` and the entries of `limitHistory`,
     * except that the initial sample `header.recordInitial` adds has no step. Empty for other
     * stage kinds.
     */
    stepDiagnostics: StepDiagnostic[];
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
export type ModelErrorDetail = { kind: "loadOnInactiveDof"; node: number; dof: number } | { kind: "duplicateSlave"; node: number; dof: number } | { kind: "slaveIsFixed"; node: number; dof: number } | { kind: "constraintCycle"; node: number; dof: number } | { kind: "constraintOnPrescribedDof"; node: number; dof: number } | { kind: "inconsistentInitialState"; node: number; dof: number } | { kind: "massOnConstrainedDof"; node: number; dof: number } | { kind: "incompatibleElementLoad"; element: number } | { kind: "invalidElement"; element: number; reason: string } | { kind: "embeddedBarOutsideMesh"; segment: number } | { kind: "embeddedBarAmbiguousHost"; segment: number } | { kind: "embeddedBarDegeneratePath" };

/**
 * `embeddedBars[i].bond` (N, mm, MPa). See `core::model::continuum::bond`.
 */
export interface BondSpecWire {
    /**
     * Total bar perimeter `n pi D` (mm).
     */
    perimeter: number;
    /**
     * Design bond strength `fbd` (MPa).
     */
    fbd: number;
    /**
     * Elastic bond stiffness `kG Ec / D` (MPa per mm of slip).
     */
    gb: number;
    /**
     * Plastic slope as a fraction of `gb`; omitted is the book's `1e-5`.
     */
    rf?: number;
    /**
     * Stop slip `alpha delta_u_max` (mm) of the bond and anchorage springs.
     */
    slipLimit: number;
    /**
     * Turn angle (degrees) above which a vertex is slip-locked; omitted is 15.
     */
    lockAngle?: number;
    /**
     * Anchorage spring at the first point of the polyline (omitted: a straight end).
     */
    start?: AnchorageSpringWire;
    /**
     * Anchorage spring at the last point.
     */
    end?: AnchorageSpringWire;
}

/**
 * `loadControlCutbacks` substepping of one step: it asked for `nominalIncrement` and halved
 * `retries` times to land on `acceptedIncrement`; the uncovered remainder is requested again by
 * the next step.
 */
export interface CutbackDetail {
    nominalIncrement: number;
    acceptedIncrement: number;
    retries: number;
}

export interface ArcSeedSpec {
    components: ArcSeedComponentSpec[];
    load?: number;
}

export interface AxialExtreme {
    strain: number;
    response: SectionResponse;
}

export interface BacktrackingSpec {
    armijo: number;
    minStep: number;
}

export interface BondPointInfo {
    /**
     * Undeformed position `[x, y]` (mm).
     */
    position: [number, number];
    /**
     * Unit tangent used for the slip direction.
     */
    tangent: [number, number];
    /**
     * `true` at a slip-locked vertex (no bond spring there).
     */
    locked: boolean;
    /**
     * Tributary length of the bond spring (mm); `0` at a locked vertex.
     */
    tributary: number;
    /**
     * Row of the bond spring in the `zeroLengths` table (the table's own rows first, then the bond springs).
     */
    spring?: number;
    /**
     * Row of the anchorage spring, at a bar end that has one.
     */
    endSpring?: number;
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

export interface GeneralSpec {
    model: GeneralModel;
    e: number;
    epsUC?: number;
    epsUT?: number;
    curvePoints?: [number, number][];
    dropAfterLastPoint?: boolean;
}

export interface IsolineOptions {
    seedAngleStride?: number;
    residualSeeds?: number;
    momentSeeds?: number;
    nearestSeeds?: number;
    continuation?: boolean;
    /**
     * Largest accepted change in moment along `alpha` between consecutive levels for a continuation root, as a
     * fraction of the largest sampled moment.
     */
    continuationJump?: number;
    acceptTolerance?: number;
    /**
     * Section evaluations after which the search of one point stops starting new seeds. Where no root exists (for
     * instance a moment direction the folded boundary near the axial maximum never reaches) the search ends here.
     */
    evalBudget?: number;
    /**
     * Fraction of the sampled axial range, at the compression end, where a root is not continued from the
     * neighbouring moment angle (inner and outer roots merge at a fold there; see the module docs).
     */
    apexFraction?: number;
}

export interface IsolinePoint {
    momentAngleIndex: number;
    levelIndex: number;
    found: boolean;
    n: number;
    mz: number;
    my: number;
    m2: number;
    m3: number;
    /**
     * Moment magnitude along the requested angle.
     */
    moment: number;
    /**
     * Profile angle and position along the profile loop.
     */
    theta: number;
    profile: number;
    topStrain: number;
    bottomStrain: number;
    /**
     * Neutral-axis depth from the extreme compression edge; `None` for uniform strain.
     */
    c: number | undefined;
    /**
     * ACI `phi` and the largest bar tensile strain behind it (see `Factoring::Aci`).
     */
    phi: number | undefined;
    epsT: number | undefined;
    /**
     * Section evaluations spent on this point.
     */
    evals: number;
}

export interface IsolineRequest {
    /**
     * Axial forces to solve at (tension positive), in any order.
     */
    levels: number[];
    /**
     * Moment-vector directions `alpha` in radians: `(m2, m3) = M (cos alpha, sin alpha)`.
     */
    momentAngles: number[];
    options?: IsolineOptions;
    /**
     * Solve in factored space (needs a factoring in `build_grid`): `levels` are factored axial forces and the
     * moments are factored.
     */
    factored?: boolean;
}

export interface IsolineResult {
    points: IsolinePoint[];
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
    /**
     * Materials that composite variants of `material` (`Parallel`, `Series`,
     * `MinMax`) refer to by index. Empty for a self-contained material.
     */
    arena?: MaterialSpec[];
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

export interface ModelOutput {
    embeddedBars: EmbeddedBarGroup[];
}

export interface MomentCurvaturePoint {
    curvature: number;
    eps0: number;
    n: number;
    mz: number;
    my: number;
    m2: number;
    m3: number;
    /**
     * Resultant `hypot(m2, m3)`.
     */
    moment: number;
    minStrain: number;
    maxStrain: number;
    converged: boolean;
    iterations: number;
    /**
     * `N - P` at the returned `eps0`.
     */
    residual: number;
}

export interface MomentCurvatureRequest {
    /**
     * Axial force carried (tension positive).
     */
    axial: number;
    /**
     * Curvature direction (see the module docs).
     */
    angle: number;
    /**
     * Curvatures to solve at, in the order given (reuse of the previous `eps0` assumes they are ordered).
     */
    curvatures: number[];
    /**
     * Relative force tolerance; default `1e-9`.
     */
    tolerance?: number;
}

export interface MomentCurvatureResult {
    points: MomentCurvaturePoint[];
    nonConverged: number;
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

export interface SectionProbeConfig {
    /**
     * Carapace materials that `core` entries of `materials` refer to by index (may be empty).
     */
    coreMaterials?: MaterialSpec[];
    materials: ProbeMaterialSpec[];
    fibers: ProbeFibers;
    /**
     * Average fibers over the strain window they span where a stress law has a step (default `true`; see
     * `materials::windowed_stress`). `false` evaluates every fiber at its centroid strain, as CalcsApp's JS engine did.
     */
    stepSmoothing?: boolean;
}

export interface SequenceSpec {
    stages: StageSpec[];
    recorders: RecorderSpec[];
}

export interface SteelSpec {
    model: SteelModel;
    fy: number;
    es: number;
    /**
     * Post-yield modulus as a fraction of `es`, clamped to `[0, 1]`.
     */
    hardeningRatio?: number;
    /**
     * Compressive strain magnitude beyond which stress drops to zero (0 = no limit).
     */
    epsUC?: number;
    /**
     * Tensile strain beyond which stress drops to zero (0 = no limit).
     */
    epsUT?: number;
    curvePoints?: [number, number][];
    dropAfterLastPoint?: boolean;
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

export type AllHosts = "all";

export type ArcDirectionSpec = "increasing" | "decreasing";

export type ArcPredictorSpec = "secant" | "tangent";

export type ConcreteModel = "elastic" | "elasticNoTension" | "elasticPlastic" | "parabolic" | "whitney" | "hognestad" | "userCurve";

export type ConvergenceSpec = { kind: "normUnbalance"; tol: number; maxIter: number } | { kind: "normDispIncr"; tol: number; maxIter: number } | { kind: "energyIncr"; tol: number; maxIter: number } | { kind: "combined"; forceTol: number; momentTol?: number; relativeTol?: number; displacementTol?: number; maxIter: number };

export type ElementLoadSpec = { kind: "uniform"; wx: number; wy: number; wz?: number } | { kind: "trapezoid"; wxI: number; wyI: number; wxJ: number; wyJ: number } | { kind: "body"; bx: number; by: number } | { kind: "edgeTraction"; edge: number; tx: number; ty: number } | { kind: "edgePressure"; edge: number; pressure: number } | { kind: "shellPressure"; pressure: number } | { kind: "shellBody"; bx: number; by: number; bz: number };

export type EmbeddedBarHostsSpec = AllHosts | HostElementSpec[];

export type Factoring = { kind: "groups"; factors: number[] } | { kind: "aci"; barGroup: number; phiTension: number; phiCompression: number; epsY: number; epsTl?: number };

export type GeneralModel = "elastic" | "userCurve";

export type IntegrationSpec = { kind: "legendre"; points: number } | { kind: "lobatto"; points: number };

export type IntegratorSpec = { kind: "loadControl"; increment: number } | { kind: "loadControlCutbacks"; increment: number; minIncrement: number } | { kind: "displacementControl"; node: number; dof: number; increment: number } | ({ kind: "arcLength" } & ArcLengthSpec);

export type LineSearchSpec = { kind: "bisection"; tol: number; maxIter: number; maxEta: number } | { kind: "regulaFalsi"; tol: number; maxIter: number; maxEta: number };

export type MaterialProbeError = { kind: "unsupportedMaterial"; material: string } | { kind: "invalidTarget"; target: number } | { kind: "invalidProbe"; reason: string } | { kind: "solverFailure"; target: number; detail: string };

export type PlaneStateSpec = "planeStress" | "planeStrain";

export type Quad4FormulationSpec = "full" | "enhanced";

export type RecorderSpec = { response: "nodeDisp"; node: number; dof: number } | { response: "nodeVel"; node: number; dof: number } | { response: "nodeAccel"; node: number; dof: number } | { response: "elementForce"; elementKind: ElementKind; elementIndex: number; component: number } | { response: "elementLoad"; elementKind: ElementKind; elementIndex: number; component: number } | { response: "modeShape"; mode: number; node: number; dof: number } | { response: "reaction"; node: number; dof: number } | { response: "fiber"; elementKind: ElementKind; elementIndex: number; point: number; fiber: number; quantity: FiberResponseKind } | { response: "gaussPoint"; elementKind: ElementKind; elementIndex: number; point: number; quantity: GaussQuantity; component: number } | { response: "embeddedBar"; bar: number; segment: number; quantity: EmbeddedBarQuantity } | { response: "bulk"; table: BulkTable; quantity: BulkQuantity };

export type SectionProbeError = { kind: "invalidFibers"; reason: string } | { kind: "invalidMaterial"; reason: string } | { kind: "degenerateSection" } | { kind: "invalidRequest"; reason: string } | { kind: "noGrid" };

export type StageSpec = { kind: "static"; id: string; steps: number; integrator: IntegratorSpec; algorithm: AlgorithmSpec; convergence?: ConvergenceSpec; holdPatternsAfter: number[] } | { kind: "modal"; id: string; modes: number } | { kind: "reset"; id: string } | { kind: "transient"; id: string; steps: number; dt: number; damping: DampingSpec; groundMotions: GroundMotionSpec[]; algorithm?: AlgorithmSpec; convergence?: ConvergenceSpec };

export type SteelModel = "elastic" | "elasticNoCompression" | "elasticPlastic" | "userCurve";

export type StopReasonDetail = "displacementTarget" | "loadFactorTarget" | "loadFactorZeroCrossing" | "chordLength" | "stepCount" | "materialLimit";

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
 * Opaque handle to a fiber-section probe (`section_probe`). Evaluation is stateless: nothing here commits
 * material history, so the same strain state always returns the same resultants.
 */
export class WasmSectionProbe {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Maximum compressive and tensile axial force over uniform strain in `[-maxStrain, maxStrain]`.
     */
    axialExtremes(max_strain: number): AxialExtremes;
    /**
     * `buildGrid` that also returns the `sampleStates` rows of the same states, from one sweep over the fibers.
     */
    buildGridSampled(angles: Float64Array, profiles: Float64Array, factoring?: Factoring | null): Float64Array;
    /**
     * Samples the PMM boundary for `solveIsolines`; returns the number of sampled states.
     */
    buildGrid(angles: Float64Array, profiles: Float64Array, factoring?: Factoring | null): number;
    /**
     * `(eps0, kz, ky)` triples in, `(n, mz, my)` triples out; with `withGroups` each state also returns the
     * per-group `(n, mz, my)` after the total.
     */
    evaluateBatch(states: Float64Array, with_groups: boolean): Float64Array;
    /**
     * `{ n, mz, my, m2, m3 }` at `(eps0, kz, ky)`; strain is `eps0 - y kz + z ky`.
     */
    evaluate(eps0: number, kz: number, ky: number): SectionResponse;
    fiberCount(): number;
    /**
     * `[strain, stress]` for every fiber, flattened.
     */
    fiberResponses(eps0: number, kz: number, ky: number): Float64Array;
    /**
     * `[min, max]` axial force over the sampled grid, or empty before `buildGrid`.
     */
    gridAxialRange(factored: boolean): Float64Array;
    groupCount(): number;
    /**
     * Stress of probe material `index` at each strain.
     */
    materialStress(index: number, strains: Float64Array): Float64Array;
    momentCurvature(request: MomentCurvatureRequest): MomentCurvatureResult;
    /**
     * `(eps0, kz, ky)` for every (angle, profile) pair, angles outermost; `profiles` is `(et, eb)` pairs.
     */
    profileStates(angles: Float64Array, profiles: Float64Array): Float64Array;
    /**
     * Every (angle, profile) state, angles outermost, as rows of `STATE_STRIDE` (11) numbers: nominal
     * `n, m2, m3`, factored `n, m2, m3`, `phi`, `epsT`, `c` (NaN where undefined), and the profile's `et, eb`.
     */
    sampleStates(angles: Float64Array, profiles: Float64Array, factoring?: Factoring | null): Float64Array;
    solveIsolines(request: IsolineRequest): IsolineResult;
    /**
     * The state of strain profile `(et, eb)` whose moment lies along `alpha`, or null if none does. The point's
     * indices are zero.
     */
    solveProfile(et: number, eb: number, alpha: number, factoring?: Factoring | null): IsolinePoint | undefined;
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
     * loadFactor, error, recorderBatches, bulkBatches, ... }` object. `recorderBatches` holds only the samples
     * this call produced (results-storage-indexeddb.md's `recorderBatch`, one entry per
     * recorder that recorded this call), not the whole run's history. There is no separate
     * "samples so far" accessor: a caller that needs the full history accumulates these
     * batches itself, same as the planned results-storage worker will. `bulkBatches` carry their
     * `progress` and `values` as `Float64Array`s, each on its own buffer, so a worker can
     * transfer them to the main thread without a copy.
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
    /**
     * What decoding resolved: the embedded-bar segment table and each bar group's TCM/POM
     * routing and crack spacing (`{ embeddedBars: EmbeddedBarGroup[] }`). Available right after
     * `decodeInput`; empty when the model has no `embeddedBars`.
     */
    modelOutput(): ModelOutput;
}

export function createMaterialProbe(config: MaterialProbeConfig): WasmMaterialProbe;

export function createSectionProbe(config: SectionProbeConfig): WasmSectionProbe;

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
    readonly __wbg_wasmsectionprobe_free: (a: number, b: number) => void;
    readonly __wbg_wasmsession_free: (a: number, b: number) => void;
    readonly createMaterialProbe: (a: any) => [number, number, number];
    readonly createSectionProbe: (a: any) => [number, number, number];
    readonly decodeInput: (a: any) => [number, number, number];
    readonly wasmmaterialprobe_applyStrain: (a: number, b: number) => [number, number, number];
    readonly wasmmaterialprobe_reset: (a: number) => [number, number];
    readonly wasmsectionprobe_axialExtremes: (a: number, b: number) => [number, number, number];
    readonly wasmsectionprobe_buildGrid: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmsectionprobe_buildGridSampled: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly wasmsectionprobe_evaluate: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmsectionprobe_evaluateBatch: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmsectionprobe_fiberCount: (a: number) => number;
    readonly wasmsectionprobe_fiberResponses: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmsectionprobe_gridAxialRange: (a: number, b: number) => [number, number];
    readonly wasmsectionprobe_groupCount: (a: number) => number;
    readonly wasmsectionprobe_materialStress: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmsectionprobe_momentCurvature: (a: number, b: any) => [number, number, number];
    readonly wasmsectionprobe_profileStates: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasmsectionprobe_sampleStates: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly wasmsectionprobe_solveIsolines: (a: number, b: any) => [number, number, number];
    readonly wasmsectionprobe_solveProfile: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmsession_advance: (a: number, b: number) => [number, number, number];
    readonly wasmsession_currentStageId: (a: number) => [number, number];
    readonly wasmsession_modalResults: (a: number) => [number, number, number];
    readonly wasmsession_modelOutput: (a: number) => [number, number, number];
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
