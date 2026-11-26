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

## Views and layout

- **Plan / elevation:** a slice of a 3D model, one story seen from above or the members along one grid line. See [Views](/docs/viewport/views).
- **Grids and levels:** reference lines and story elevations; layout, not part of the model. See [Grids and levels](/docs/model/grids-levels).
- **Underlay:** a PDF drawing sheet shown under a level's plan. See [PDF underlays](/docs/viewport/underlays).
- **Property:** the element type and arguments a drawing tool draws with. See [Drawing tools](/docs/model/drawing-tools#frame-properties).

## Light-frame wood (Carapace only)

- **Stud wall:** a wood shear wall element with its framing, openings, sheathing and hold-downs. See [Stud walls](/docs/model/stud-walls).
- **Pier:** a full-height stretch of wall between openings or wall ends; each pier end has a hold-down.
- **Joist floor:** a floor outline with one-way joists that takes area loads down to the walls and beams under it. See [Joist floors](/docs/model/joist-floors).
- **Diaphragm:** what ties a level together, either rigid (a constraint) or flexible (sheathing elements).

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
