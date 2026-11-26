---
title: Quads and a triangle with pressure
description: MITC4 quads and a DKGT triangle under self-weight and pressure.
features: ShellMITC4, ShellDKGT, shell pressure, self-weight
---

The shell patch with a `ShellDKGT` triangle attached, under nodal loads, shell self-weight and a normal pressure.

OpenSees shells take no pressure, so PySees exports it as the equivalent nodal loads, the same tributary-area integral Carapace uses. A triangle's self-weight is exported the same way. The comparison adds those loads back to OpenSees' element forces, so element forces are compared too.
