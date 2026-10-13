---
title: Pushover analysis
description: Displacement-controlled lateral loading.
order: 4
keywords: pushover displacement control node dof increment
---

**Run Pushover Analysis** drives a node to increasing displacement while the reference load patterns set the shape of loading.

| Option | Default | Meaning |
|---|---|---|
| Patterns | — | Reference load patterns (the lateral load shape) |
| Control node | — | Node whose displacement is controlled |
| DOF | — | Controlled degree of freedom, counted from 1 |
| Increment | 0.01 | Displacement per step |
| Steps | 100 | Number of steps |
| Convergence | — | See [Convergence settings](/docs/analysis/convergence) |

The **Pushover** [plot preset](/docs/results/plots) charts base shear against roof displacement.
