---
title: Rayleigh damping from modal periods
description: The 3D pulse cantilever with 5% damping anchored to its first and third periods.
features: Newmark, Rayleigh damping from modes
---

Instead of coefficients, the damping is given as 5% at two named periods (T1 and T3). Both engines solve the modes when the earthquake starts and set αM and βK from them. The exported script does this with `eigen` and `rayleigh`.
