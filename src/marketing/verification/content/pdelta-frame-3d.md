---
title: P-Delta 3D frame
description: A two-story 3D frame with P-Delta columns pushed diagonally: a known formulation difference.
features: PDelta 3D, known difference
---

A 2 × 1 bay, two-story 3D frame with P-Delta columns carries heavy gravity loads, held, then is pushed diagonally (X and 0.6 Y at a roof corner).

Both bending planes of every column get the geometric stiffness. The same formulation difference as in 2D applies: Carapace includes P-δ, OpenSees' `PDelta` the chord term only.
