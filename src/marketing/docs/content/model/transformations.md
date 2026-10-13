---
title: Geometric transformations
description: Linear, PDelta and Corotational transforms and the vecxz vector.
order: 5
keywords: geomTransf vecxz local axes pdelta corotational
---

A geometric transformation tells a beam how its local axes relate to global axes and whether geometric nonlinearity is included. Beams reference a transformation by ID. They live in the **Transforms** group.

| Type | Meaning | Carapace |
|---|---|---|
| Linear | Small displacements | Supported |
| PDelta | Includes P-Δ effects | Supported |
| Corotational | Large displacements | Supported in 2D; in 3D it runs as Linear with a warning |

## vecxz in 3D

In a 3D model every transformation needs `vecxz`, a vector in the beam's local x–z plane. The local axes follow the OpenSees rule: `y = vecxz × x`, then `z = x × y`. Beam loads, deformed shapes and force diagrams use these axes. See [Concepts](/docs/getting-started/concepts-glossary).

> [!WARNING]
> A 3D transformation without `vecxz` is a compile error.
