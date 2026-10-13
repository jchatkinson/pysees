---
title: Concepts and glossary
description: Terms used throughout PySees and these docs.
order: 4
keywords: ndm ndf z-up local axes units stage case pseudo-time recorder
---

## Model dimension: ndm and ndf

**ndm** is the number of spatial dimensions (2 or 3). **ndf** is the number of degrees of freedom per node: 3 for a 2D model, 6 for a 3D model. Both are chosen when you create the model and cannot be changed. Shells and 3D fiber beams need a 3D model.

## Axes

- **3D models are Z-up.** Plan is X–Y and levels rise in Z. Gravity acts along −Z.
- **2D models** lie in the XY plane with Y up.
- **Beam local axes:** local x runs from the first node to the second. In 2D, local y is x rotated 90° counter-clockwise. In 3D, the transformation's `vecxz` vector lies in the local x–z plane, then `y = vecxz × x` and `z = x × y`. Beam loads and the force diagrams use these axes.
- **Shells:** nodes are listed counter-clockwise and the normal follows the right-hand rule. Stress resultants are per unit length in the shell's local axes.

## Units

The model is stored in one consistent system of length, force and time units, chosen at creation. **Display units** are presentation only: values convert at the screen and are never stored converted. A model can also be unitless. See [Units](/docs/viewport/units).

## Analysis terms

- **Stage / case:** one step of the analysis sequence, such as a static load ramp or an earthquake. Results are organised by case.
- **Pseudo-time:** the load factor in a static analysis, which runs from 0 to 1 across the steps.
- **Load pattern claiming:** each analysis block names the load patterns it applies. An empty list means every pattern no other stage claims.
- **Hold loads:** keeps the loads from a stage constant for the stages that follow (OpenSees `loadConst`).
- **Reset vs. wipe:** *Reset* restores the model to its initial state. *Wipe analysis* only affects the exported script and has no effect on a Carapace run.
- **Relative acceleration:** in an earthquake analysis, results are relative to the moving ground, not absolute.
- **Recorder:** a command that tells the analysis what to save (node displacements, reactions, element forces).

## Files

- **Project:** an annotated OpenSeesPy script that PySees can reopen completely.
- **Export:** a script for running the model in OpenSees. See [Files and interoperability](/docs/files/save-open-projects).
