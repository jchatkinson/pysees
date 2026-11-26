---
title: Reinforced concrete moment–curvature
description: A fiber section under constant axial load, driven in curvature past cracking, yield and crushing.
features: zeroLengthSection, fiber section, Concrete01, Steel01
---

A 300 × 500 mm concrete section with four 20 mm corner bars is modelled as a `zeroLengthSection` (unit length, so rotation is curvature). An axial load is applied first and held, then the curvature is driven under displacement control.

This exercises the fiber integration of Concrete01 (with crushing) and Steel01 through cracking, yield and the post-peak branch.
