---
title: P-Delta cantilever
description: A column under heavy axial load pushed sideways with a P-Delta transformation: a known formulation difference.
features: PDelta transformation, known difference
---

A 3 m elastic column carries a 1 MN axial load (about a quarter of its buckling load), held constant, and is then pushed sideways.

The two engines formulate P-Delta differently. OpenSees' `PDelta` adds only the chord-rotation term N/L, so its lateral stiffness is exactly 3EI/L³ − P/L (second plot). Carapace's `PDelta` uses the consistent geometric stiffness, which also captures P-δ, the effect of member curvature. That brings it closer to the exact beam-column solution (first plot). Without axial load the two are identical.
