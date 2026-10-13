---
title: Static load analysis
description: Ramp load patterns in load control.
order: 3
keywords: static gravity load control steps hold loadConst
---

**Run Static Load Analysis** ramps the load patterns it claims from zero to full over a number of steps (pseudo-time 0 to 1).

| Option | Default | Meaning |
|---|---|---|
| Patterns | all unclaimed | The load patterns applied. Empty means every pattern no other stage uses |
| Steps | 10 | Number of load increments |
| Hold loads | — | Keep these loads constant for later stages (`loadConst`) |
| Convergence | — | See [Convergence settings](/docs/analysis/convergence) |

> [!TIP]
> Run gravity first with **Hold loads** on, then a pushover with its own pattern. Patterns are declared just before the stage that uses them, so gravity does not ramp the pushover pattern.
