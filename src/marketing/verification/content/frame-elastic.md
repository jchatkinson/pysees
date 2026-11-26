---
title: 2D frame: earthquake and pushover
description: A two-story, two-bay elastic frame through eigen, gravity, a 20 s earthquake, a reset and a pushover.
features: Newmark, modal Rayleigh damping, UniformExcitation, reset, pushover
---

The 2D frame template with seismic mass on its floors runs the full sequence: eigen analysis, gravity held constant, the LOS000 record (0.1 g scale, 1999 steps) with 5% Rayleigh damping anchored to the first and third modes, a reset, gravity again and a pushover.

Displacements, reactions and element forces are compared at every one of the 2110 steps, and velocities and relative accelerations on the earthquake steps. Rayleigh coefficients from the computed periods also feed back into the integration, so the modal stage is checked too.
