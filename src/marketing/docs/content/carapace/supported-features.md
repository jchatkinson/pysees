---
title: Supported features
description: What the in-browser Carapace solver can run, and what it skips.
order: 1
keywords: carapace wasm solver limitations diagnostics unsupported
---

Analysis runs in your browser on **Carapace**, a Rust finite-element engine compiled to WebAssembly. Anything it cannot handle is reported as a diagnostic: an **error** stops the run, a **warning** means the item was skipped or defaulted.

## Supported

| Area | Supported |
|---|---|
| Models | 2D (3 DOF/node) and 3D (6 DOF/node) |
| Elements | Truss, ElasticBeamColumn, DispBeamColumn (fiber), zeroLength and zeroLengthSection (2D), ShellMITC4 and ShellDKGT (3D) |
| Light-frame wood (3D, Carapace only) | [Stud walls](/docs/model/stud-walls) with `Anchorage` hold-downs and wall loads, flexible diaphragms, [joist floors](/docs/model/joist-floors) bearing on walls and beams |
| Constraints | `fix`; `equalDOF`, `equalDOF_Mixed`, `rigidLink` (`beam`, `bar`) and, in 3D, `rigidDiaphragm` |
| Uniaxial materials | Elastic, ElasticPP, ENT, Steel01, Steel02, Concrete01, Concrete02, Hysteretic, Pinching4, Parallel, Series, MinMax, Anchorage (hold-downs). See [Materials](/docs/model/materials) |
| Sections | Fiber (fibers and rectangular patches), ElasticMembranePlateSection for shells, with optional stiffness modifiers |
| Time series | Constant, Linear, Path |
| Patterns | Plain, UniformExcitation |
| Geometric transformations | Linear; PDelta (2D and 3D elastic members); Corotational (2D elastic and fiber members) |
| Analyses | Static load control, pushover (displacement control, including several pushes in a row for a cyclic protocol), earthquake (Newmark transient), eigen |
| Recorders | Node displacement, velocity, acceleration and reaction; element force; shell stress resultants; stud-wall pier forces and framing member forces |

## Behaviour that differs from OpenSees

Everything in the table except the light-frame wood elements and `Anchorage` is compared against OpenSees on the [verification page](/verification). The differences below are the ones that show up there.

- Shell mass is lumped (OpenSees' `ShellMITC4` uses a consistent mass), so modal frequencies of shell models agree only approximately: within 10% on a coarse mesh, closer as it is refined.
- `PDelta` uses the consistent geometric stiffness, which also captures P-δ (member curvature). OpenSees' `PDelta` keeps only the chord term N/L, so under heavy axial load the two differ by a few percent, with Carapace closer to the exact beam-column solution.
- An earthquake record that starts at a non-zero acceleration: Carapace starts from the consistent initial acceleration, OpenSees from zero. Records padded with a zero sample (`-prependZero`, as PySees does for imported records) agree exactly.
- Under `Corotational` geometry, OpenSees reports a member's local end shear with its undeformed length, Carapace with its current chord length. Moments, axial forces, displacements and reactions agree.
- Shell stiffness modifiers (`f11 f22 f12`, `m11 m22 m12`, `v13 v23`) have no OpenSees equivalent. An exported script carries them only when the membrane factors are all equal, the bending factors are all equal and, for `ShellMITC4`, the shear factors equal the bending factor; otherwise the section is written unmodified, with a warning comment.
- A `zeroLength` element can carry Coulomb friction, a Carapace feature with no OpenSees equivalent: an exported script writes the element without it, with a warning comment, and saving a project keeps it.
- Fiber coordinates are measured from the area-weighted centroid of the section's fibers, as OpenSees does, so a section that is not symmetric about the origin it was drawn against responds the same in both.
- Earthquake analysis uses fixed-step Newmark.
- *Wipe Analysis* has no effect, because each stage starts with fresh analysis objects.
- Stud walls, joist floors and flexible diaphragms have no OpenSees equivalent. An exported script approximates each wall and diaphragm bay as elastic shells and each floor as nodal loads, with warning comments; its results will not match Carapace's.
- Several nodal loads on the same node, DOF and pattern add up, as in OpenSees.

## Common diagnostics

- Unsupported material, pattern type or time series: the run stops. Use a supported type.
- An eigen analysis asking for more modes than there are massive free DOFs: assign nodal masses or request fewer modes.
- A 3D geometric transformation without `vecxz`, or a 3D fiber section without `-GJ`: add it.
- Unsupported element types, section types, patch types and corotational transforms are skipped with a warning.
