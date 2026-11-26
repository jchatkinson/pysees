---
title: Modified Newton
description: The fiber cantilever pushover solved with Modified Newton.
features: solution algorithm, convergence test
---

The fiber cantilever pushover, solved to a tight tolerance with this setting: the tangent is formed once per step, at the state the step starts from, and reused for every iteration (OpenSees `ModifiedNewton`).

Every algorithm converges to the same equilibrium path. The comparison checks that each one is wired to the same convergence test and tolerance in both engines, and that it gets there.
