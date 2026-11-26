---
title: Newton with line search
description: The fiber cantilever pushover solved with Newton with line search.
features: solution algorithm, convergence test
---

The fiber cantilever pushover, solved to a tight tolerance with this setting: Newton with a line search on each correction (OpenSees `NewtonLineSearch`).

Every algorithm converges to the same equilibrium path. The comparison checks that each one is wired to the same convergence test and tolerance in both engines, and that it gets there.
