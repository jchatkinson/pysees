---
title: Ground motion on a 2D cantilever
description: A cantilever with nodal and member mass under an acceleration pulse, then free vibration.
features: Newmark, UniformExcitation, element mass, Rayleigh coefficients
---

A single elastic column with a tip mass and distributed member mass is shaken by a sine pulse that ends after 0.6 s, then vibrates freely to 4 s. Rayleigh damping is given by its coefficients, and the solution algorithm is `Linear`.

Displacements, velocities and relative accelerations are compared at every step, including after the record ends.
