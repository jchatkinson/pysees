# Carapace material-preview handoff

## Goal

Provide a browser/WASM API that evaluates a uniaxial material over a prescribed strain history. PySees will use it for the Material Preview chart; it replaces the former local OpenSeesPy probe.

The API must reproduce this OpenSeesPy conceptually equivalent model:

```python
ops.model('basic', '-ndm', 1, '-ndf', 1)
ops.uniaxialMaterial(material_type, material_tag, *parameters)
ops.node(1, 0.0)
ops.node(2, 0.0)
ops.fix(1, 1)
ops.element('zeroLength', 1, 1, 2, '-mat', material_tag, '-dir', 1)
```

For each strain target, PySees needs the relative displacement of node 2 with respect to node 1 and the material force. With unit area and unit gauge length, these are reported as strain and stress.

## Required behavior

### Persistent material state

Create one probe session for the whole protocol. Material trial and committed state must persist from one target to the next; a cyclic history must not rebuild the material or reinitialize it between targets.

OpenSees equivalent: create the material and zero-length element once, then repeatedly call `ops.analyze(1)` after changing the imposed displacement.

### Kinematic prescribed displacement

The probe must impose the target relative displacement directly. It must not require a nonzero tangent stiffness, a reference load, or a load-factor sensitivity at the controlled DOF.

OpenSees equivalent: an `sp` constraint on node 2, DOF 1, updated for each target, or another prescribed-displacement analysis path. A zero-tension Concrete01 material at positive strain must still accept the target and report zero resistance.

Carapace's existing `DisplacementControl` path is not sufficient by itself: it predicts a load-factor increment from the tangent response to a unit reference load. That response is undefined or zero on a zero-tangent branch, which makes the probe fail before it can report the physically valid zero force.

### Response at every supplied target

For every protocol entry, including the initial zero and repeated targets, return one response:

```ts
type MaterialProbePoint = {
  index: number
  strain: number       // imposed relative displacement, node2.x - node1.x
  stress: number       // material resisting force for unit area
}
```

The returned strain should equal the requested target within numerical tolerance. Repeated targets must retain and report the current committed response without advancing the material state.

### Force and sign convention

Define one sign convention and expose it consistently. PySees expects positive strain to mean node 2 moves in positive local x relative to node 1, and positive stress to be the material's tensile resisting force.

This corresponds to `-ops.nodeReaction(1, 1)` in the former OpenSeesPy probe. If Carapace exposes element-local force instead, document which local-force component and sign produces this value.

### Supported material translation

The probe should accept the same `MaterialSpec` arena representation that `CarapaceInputV1` decodes. Initial scope:

- `elastic`
- `elasticPp`
- `ent`
- `steel01`
- `concrete01`

Do not silently coerce unknown material parameters to zero. Reject unsupported kinds with a structured capability error. The PySees adapter will normalize schema argument casing before constructing `MaterialSpec`.

### Errors and cancellation

Expose structured errors that identify the protocol index and requested target. Distinguish:

- unsupported material;
- invalid/non-finite target;
- invalid probe construction;
- solver failure, if a nonlinear solve is actually required;
- cancellation.

The operation must be cooperative: a caller can cancel between protocol points. A failed target must leave the last committed material state intact for diagnostics or a retry.

## Preferred WASM API

Use a dedicated probe instead of encoding it as a multi-stage `CarapaceInputV1` analysis. That keeps the API independent of recorder storage and avoids rebuilding `Analysis` between cyclic legs.

```ts
export type MaterialProbeConfig = {
  material: MaterialSpec
  initialStrain?: number // default 0
}

export class WasmMaterialProbe {
  applyStrain(target: number): { strain: number; stress: number }
  reset(): void
}

export function createMaterialProbe(config: MaterialProbeConfig): WasmMaterialProbe
```

`applyStrain` may internally use a two-node zero-length model and a prescribed-DOF constraint, or call the material constitutive interface directly. The external behavior above is the contract.

An acceptable alternative is to extend `WasmSession` with an in-place absolute displacement update that preserves the existing `Analysis` and material state. It must still support zero-tangent branches without requiring reference-load sensitivity, and must expose the probe force.

## Acceptance cases

1. **Elastic:** `E=200000`, targets `[0, 0.001, -0.001, 0]` returns stresses `[0, 200, -200, 0]`.
2. **Concrete01, tension then compression:** default Concrete01 with `[0, 0.001, -0.0005, -0.002, 0]` completes without convergence failure. Its tensile branch reports its defined zero-force behavior and the compressive branch responds according to Concrete01 state rules.
3. **ElasticPP cycle:** load past positive yield, reverse past negative yield, then return to zero. The final response demonstrates committed plastic history rather than a fresh envelope evaluation.
4. **Repeated target:** `[0, 0, 0.001, 0.001]` returns four points and does not advance state on either repeated target.
5. **Cancellation:** cancelling a long protocol stops at a point boundary and does not emit later points.

## PySees integration boundary

PySees will run the WASM probe in its existing Carapace worker. It will supply a compiled `MaterialSpec` and a numeric strain list, then append the returned points to the chart. PySees does not need recorder persistence, node displacement tables, load patterns, or analysis stages for this feature.
