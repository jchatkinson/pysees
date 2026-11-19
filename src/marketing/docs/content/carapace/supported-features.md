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
| Uniaxial materials | Elastic, ElasticPP, ENT, Steel01, Steel02, Concrete01. See [Materials](/docs/model/materials) for the ones the solver has but PySees does not run yet |
| Sections | Fiber (fibers and rectangular patches), ElasticMembranePlateSection for shells, with optional stiffness modifiers |
| Time series | Constant, Linear, Path |
| Patterns | Plain, UniformExcitation |
| Analyses | Static load control, pushover (displacement control), earthquake (Newmark transient), eigen |
| Recorders | Node displacement, velocity, acceleration and reaction; element force |

## Behaviour that differs from OpenSees

- Shell mass is lumped, so modal frequencies of shell models agree only approximately.
- Shell stiffness modifiers (`f11 f22 f12`, `m11 m22 m12`, `v13 v23`) have no OpenSees equivalent. An exported script carries them only when the membrane factors are all equal, the bending factors are all equal and, for `ShellMITC4`, the shear factors equal the bending factor; otherwise the section is written unmodified, with a warning comment.
- A `zeroLength` element can carry Coulomb friction, a Carapace feature with no OpenSees equivalent: an exported script writes the element without it, with a warning comment, and saving a project keeps it.
- Fiber coordinates are measured from the area-weighted centroid of the section's fibers, as OpenSees does, so a section that is not symmetric about the origin it was drawn against responds the same in both.
- Earthquake analysis uses fixed-step Newmark.
- *Wipe Analysis* has no effect, because each stage starts with fresh analysis objects.

## Common diagnostics

- Unsupported material, pattern type or time series: the run stops. Use a supported type.
- An eigen analysis asking for more modes than there are massive free DOFs: assign nodal masses or request fewer modes.
- A 3D geometric transformation without `vecxz`, or a 3D fiber section without `-GJ`: add it.
- Unsupported element types, section types, patch types and corotational transforms are skipped with a warning.
