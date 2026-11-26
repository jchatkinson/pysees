---
title: Modal analysis: shell plate
description: Frequencies of a cantilevered slab: a known difference from lumped versus consistent shell mass.
features: eigen, ShellMITC4 mass, known difference
---

The plate template (6 × 3 m, 200 mm, clamped on one edge) with its slab density. Its first four modes are compared.

Carapace lumps a shell's mass at its nodes; OpenSees' `ShellMITC4` forms a consistent mass matrix. Both are standard choices, and they converge as the mesh is refined. On this coarse mesh the frequencies differ by up to 10%. The stiffness is identical: the static plate cases agree to 1e-6.
