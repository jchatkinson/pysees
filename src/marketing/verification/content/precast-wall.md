---
title: Precast wall with yielding connectors
description: A two-panel precast wall on bearings with yielding shear connectors, pushed laterally.
features: DispBeamColumn, zeroLength, Steel02, Concrete02, ElasticPP, ENT, MinMax
---

The PySees precast wall template: two fiber wall panels on compression-only (ENT) bearings, joined by yielding Steel02 connectors, with elastic–plastic stabilisers, under gravity and then a lateral push.

It mixes many materials and zero-length springs. Both engines run to a tight convergence tolerance, because the element forces in such a model depend on where each Newton iteration stops.
