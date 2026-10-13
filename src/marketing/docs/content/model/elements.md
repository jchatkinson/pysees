---
title: Elements
description: The element types you can add, with their arguments in 2D and 3D.
order: 7
keywords: truss elasticBeamColumn dispBeamColumn shell MITC4 DKGT zeroLengthSection
---

Elements are in the **Elements** group. Click an element in the viewport or its row to edit it. The form changes with the model dimension.

| Element | Nodes | Main arguments | Model |
|---|---|---|---|
| `Truss` | 2 | area, material, optional `-rho` | 2D, 3D |
| `elasticBeamColumn` | 2 | 2D: A, E, Iz, transformation. 3D: A, E, G, J, Iy, Iz, transformation. Optional `-mass` | 2D, 3D |
| `dispBeamColumn` | 2 | transformation, beam integration, optional `-mass` (uses a fiber section) | 2D, 3D |
| `ShellMITC4` | 4 | section | 3D |
| `ShellDKGT` | 3 | section | 3D |
| `zeroLengthSection` | 2 | section, optional `-orient` | 2D (skipped with a warning in 3D) |

Other OpenSees element names exist in the generated schemas but are not available in the element form.

## Shells

Shells need a 3D model and an `ElasticMembranePlateSection`. List the nodes counter-clockwise; the normal follows the right-hand rule. Loads on shells can be nodal, self-weight or pressure. See [Load patterns](/docs/model/load-patterns).

## Fiber beams

In 3D a `dispBeamColumn` needs torsional stiffness (`-GJ`) on its fiber section and a Linear transformation.
