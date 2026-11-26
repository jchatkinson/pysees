---
title: 3D elastic cantilever with torsion
description: A 3D cantilever under a general tip load and distributed loads in all three local directions.
features: ElasticBeamColumn 3D, vecxz, element loads wx/wy/wz, torsion
---

A 4 m vertical member (Z-up) in two elements carries a tip load with all six components, plus uniform element loads `wx`, `wy` and `wz`. Its section has different Iy and Iz, and a torsion constant J.

This checks the 3D elastic stiffness, the local axes built from `vecxz`, and the consistent nodal loads of distributed loads in each local direction. A transposed axis or a wrong sign on one term would show up here.
