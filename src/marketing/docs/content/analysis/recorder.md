---
title: Whole Model Recorder
description: Choose what to record during the analysis.
order: 2
keywords: recorder output displacement reaction force velocity acceleration
---

Add this block before the analysis stages. Without it, there is nothing to show afterwards.

It records node displacements and reactions for the whole model and element forces for every element:

- `localForce` for elastic and displacement-based beams, matching the local N, V and M shown in PySees.
- `force` for trusses and zero-length elements (global).
- Shell stress resultants for shells.

| Option | Default | Meaning |
|---|---|---|
| Directory | `out` | Output folder used in the exported script |
| Record velocity and relative acceleration | No | Also record velocities and accelerations (needed for transient plots) |
