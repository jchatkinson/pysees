---
title: Supports
description: Restrain degrees of freedom with fix commands.
order: 2
keywords: fix constraint boundary fixed pinned restraint reaction
---

Supports are `fix` entries in the **Constraints (fix)** group. Each one names a node and gives a 0 or 1 flag per degree of freedom: `1` restrains the DOF, `0` leaves it free. A 2D model has three flags (X, Y, rotation); a 3D model has six.

Supports are drawn in the viewport. Toggle them from **View > Supports**.

Reactions at fixed DOFs are recorded when the [Whole Model Recorder](/docs/analysis/recorder) is in the analysis, and can be shown in the [results tables](/docs/results/tables) and [plots](/docs/results/plots).
