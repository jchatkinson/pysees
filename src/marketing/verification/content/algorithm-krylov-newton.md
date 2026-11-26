---
title: Krylov–Newton
description: The fiber cantilever pushover solved with Krylov–Newton.
features: solution algorithm, convergence test
---

The fiber cantilever pushover, solved to a tight tolerance with this setting: Newton with Krylov subspace acceleration (OpenSees `KrylovNewton`).

Every algorithm converges to the same equilibrium path. The comparison checks that each one is wired to the same convergence test and tolerance in both engines, and that it gets there.
