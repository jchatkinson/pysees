---
title: Corotational fiber column
description: A reinforced concrete fiber column under axial load pushed to 4% drift with corotational geometry.
features: DispBeamColumn, Corotational transformation, fiber section, known reporting difference
---

A 3 m reinforced concrete column of four fiber elements with a `Corotational` transformation carries a 1.2 MN axial load and is pushed to 4% drift. Geometric softening shows in the falling branch.

Displacements, reactions, end moments and axial forces agree to 1e-6. The element end shears differ slightly because OpenSees reports a corotational member's local shear as (Mi + Mj)/L₀, with the undeformed length, while Carapace divides by the current chord length.
