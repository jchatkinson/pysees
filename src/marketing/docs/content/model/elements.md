---
title: Elements
description: The element types you can add, with their arguments in 2D and 3D.
order: 7
keywords: truss elasticBeamColumn dispBeamColumn shell MITC4 DKGT zeroLength zeroLengthSection friction
---

Elements are in the **Elements** group. Click an element in the viewport or its row to edit it. The form changes with the model dimension.

| Element | Nodes | Main arguments | Model |
|---|---|---|---|
| `Truss` | 2 | area, material, optional `-rho` | 2D, 3D |
| `elasticBeamColumn` | 2 | 2D: A, E, Iz, transformation. 3D: A, E, G, J, Iy, Iz, transformation. Optional `-mass` | 2D, 3D |
| `dispBeamColumn` | 2 | transformation, beam integration, optional `-mass` (uses a fiber section) | 2D, 3D |
| `ShellMITC4` | 4 | section | 3D |
| `ShellDKGT` | 3 | section | 3D |
| `zeroLength` | 2 | `-mat` tags and `-dir` directions, optional `-orient` | 2D (skipped with a warning in 3D) |
| `zeroLengthSection` | 2 | section, optional `-orient` | 2D (skipped with a warning in 3D) |

Other OpenSees element names exist in the generated schemas but are not available in the element form.

Three Carapace-only elements are drawn and edited with their own tools and cards rather than the element form: `studWall` ([Stud walls](/docs/model/stud-walls)), `joistFloor` ([Joist floors](/docs/model/joist-floors)) and `diaphragm` (a flexible diaphragm, assigned from the [selection panel](/docs/model/editing#selection-panel)). Members, shells and supports can also be drawn in the viewport with the [drawing tools](/docs/model/drawing-tools).

## Zero-length springs

A `zeroLength` element joins two nodes, usually coincident, with an independent material in each listed direction: `-mat 1 2 -dir 1 2` puts material 1 on ux and material 2 on uy (3 is rz; in 3D 4-6 are the rotations). Directions without a material are free. `-orient` rotates the element's local axes. Use *force-deformation* materials (set when a uniaxial material is created) so the material's stress is the spring force and its strain the relative displacement.

The node order matters for one-sided materials: the relative displacement is node J minus node I, so with `ENT` (compression-only) put the supporting node first and the node that presses on it second.

Tick **Coulomb friction** in the element form to couple a shear direction to the compression in another: the normal direction takes the material (such as `ENT`), the shear direction takes none, and the shear force slides once it exceeds `mu` times the compression. Friction is a Carapace feature; OpenSees has no equivalent in a `zeroLength`, so an exported script writes the element without it and adds a warning comment. A saved project keeps it.

## Shells

Shells need a 3D model and an `ElasticMembranePlateSection`. List the nodes counter-clockwise; the normal follows the right-hand rule. Loads on shells can be nodal, self-weight or pressure. See [Load patterns](/docs/model/load-patterns).

### Stiffness modifiers

An `ElasticMembranePlateSection` can scale individual terms of its stiffness, as ETABS does for cracked slabs and walls. In the section form, set any of `f11 f22 f12` (membrane), `m11 m22 m12` (bending) and `v13 v23` (transverse shear); a blank factor is 1. Carapace applies them to results, resultants and element forces. Mass is unchanged. `v13` and `v23` have no effect on `ShellDKGT` triangles, which have no transverse shear.

OpenSees has only a plate modifier, `Ep_modifier`, which scales bending and shear together. A plate modifier on its own (without stiffness modifiers) is read as `m11 = m22 = m12 = v13 = v23`. Setting both is an error. When you export a script, stiffness modifiers are written as `E × f` and `Ep_modifier = m / f` if that reproduces them exactly: all membrane factors equal, all bending factors equal and, for `ShellMITC4`, `v13 = v23 = m`. Otherwise the section is written unmodified, with a warning comment. Saving a project keeps the modifiers either way; importing a plain script cannot recover them.

## Fiber beams

In 3D a `dispBeamColumn` needs torsional stiffness (`-GJ`) on its fiber section and a Linear transformation.
