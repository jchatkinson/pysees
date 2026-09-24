/* tslint:disable */
/* eslint-disable */

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
     * See `input_v1::Session::advance`. Returns a
     * `{ done, stageComplete, stepsTaken, loadFactor, error }` object.
     */
    advance(step_budget: number): any;
    /**
     * The `AnalysisSequence` stage id `advance` is currently in (or, once
     * done, whichever stage stopped it) — `undefined` once every stage has
     * completed.
     */
    currentStageId(): string | undefined;
    /**
     * `[pseudoTime, value][]` samples recorded so far for one recorder,
     * in the order given to `SequenceSpec::recorders`.
     */
    recorderSamples(recorder_index: number): any;
}

export function axial_displacement(load: number, length: number, area: number, modulus: number): number;

/**
 * Same 2-node truss case as `axial_displacement`, but computed through the
 * real `Domain`/`Element::Truss`/`Analysis` architecture (M1) rather than
 * the closed-form placeholder — see implementation-plan.md M1 acceptance
 * criteria. Kept alongside the M0 export for wasm/Node verification.
 */
export function axial_displacement_via_analysis(load: number, length: number, area: number, modulus: number): number;

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
export function decodeInput(value: any): WasmSession;

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
 * spring's yield point within a single step — needs `Algorithm::
 * NewtonRaphson`'s iteration to resolve correctly (`Algorithm::Linear`'s
 * one-shot solve can't cross a material regime boundary within a step).
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
    readonly __wbg_wasmsession_free: (a: number, b: number) => void;
    readonly axial_displacement: (a: number, b: number, c: number, d: number) => number;
    readonly axial_displacement_via_analysis: (a: number, b: number, c: number, d: number) => number;
    readonly damped_sdof_free_vibration_displacement: (a: number, b: number) => number;
    readonly decodeInput: (a: any) => [number, number, number];
    readonly disp_beam_column_cantilever_tip_deflection: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly mass_spring_chain_frequencies: () => [number, number];
    readonly newton_raphson_elastic_plastic_displacement: (a: number) => number;
    readonly simply_supported_beam_end_rotation: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly wasmsession_advance: (a: number, b: number) => [number, number, number];
    readonly wasmsession_currentStageId: (a: number) => [number, number];
    readonly wasmsession_recorderSamples: (a: number, b: number) => [number, number, number];
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
