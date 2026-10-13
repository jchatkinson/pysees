---
title: Convergence settings
description: Algorithm, test, tolerance and iteration limit for nonlinear analyses.
order: 8
keywords: newton krylov line search tolerance maxIter norm energy
---

Static, pushover and earthquake blocks share these options.

| Setting | Options | Default |
|---|---|---|
| Algorithm | Newton, ModifiedNewton, KrylovNewton, NewtonLineSearch, Linear | — |
| Test | NormDispIncr, NormUnbalance, EnergyIncr | — |
| Tolerance | any positive number | 1e-6 |
| Max iterations | integer | 25 |

How Carapace runs each algorithm: ModifiedNewton uses the initial tangent, KrylovNewton uses a maximum dimension of 3, and NewtonLineSearch uses regula falsi.
