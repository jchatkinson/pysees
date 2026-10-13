---
title: Earthquake analysis
description: Transient analysis under ground motion, with Rayleigh damping.
order: 5
keywords: earthquake transient ground motion newmark damping rayleigh time history
---

**Run Earthquake Analysis** is a Newmark transient analysis (average acceleration, γ = 0.5, β = 0.25) under UniformExcitation patterns. Results are **relative to the moving ground**.

## Workflow

1. Import a record into a Path [time series](/docs/model/ground-motion-input).
2. Add a UniformExcitation [load pattern](/docs/model/load-patterns) that uses it, with a direction.
3. Assign [masses](/docs/model/nodes-masses).
4. Add the [recorder](/docs/analysis/recorder) with velocity and acceleration enabled if you want those results.
5. Add the earthquake block and run.

## Options

| Option | Default | Meaning |
|---|---|---|
| Patterns | — | The ground-motion patterns |
| dt | 0.01 | Time step |
| Steps | 1000 | Number of steps |
| Damping | — | See below |
| Convergence | — | See [Convergence settings](/docs/analysis/convergence) |

## Rayleigh damping

| Mode | Inputs |
|---|---|
| Modal periods | Two named modes (such as T1 and T3) and a damping percentage |
| Anchor periods | Two periods and a damping percentage |
| Coefficients | `alphaM` and `betaK`, with C = αM·M + βK·K on the current stiffness |

The form shows the solved periods, or an error if they cannot be found. Modal damping needs mass and enough modes.

> [!WARNING]
> Displacement and velocity time series, initial velocities and loads inside the pattern are not supported in Carapace earthquake stages. The acceleration series must be present.
