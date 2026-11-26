---
title: A record that starts at a non-zero acceleration
description: The pulse cantilever under a record whose first sample is its peak: a known difference in the starting state.
features: Newmark initial conditions, known difference
---

The same cantilever, but the record starts at its peak acceleration instead of zero.

Carapace starts the integration from the consistent initial acceleration, M·a₀ = −M·ι·ag(0) − C·v₀ − K·u₀. OpenSees starts from a₀ = 0. The relative acceleration therefore differs by the initial ground acceleration at the start, and the difference dies out with damping. Records that start at zero, or are padded with a zero sample (PySees does this for imported records with `-prependZero`), agree to 1e-6.
