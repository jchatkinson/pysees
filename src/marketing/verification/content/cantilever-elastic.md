---
title: 2D elastic cantilever
description: A four-element elastic cantilever under a tip load, checked against PL³/3EI.
features: ElasticBeamColumn, Linear transformation, load control
---

A 3 m column fixed at its base, modelled with four `elasticBeamColumn` elements (E = 200 GPa, I = 1×10⁻⁴ m⁴), is loaded laterally at its tip in ten load-control steps up to 10 kN.

This is the simplest case on the page: it checks the elastic beam stiffness, the coordinate transformation and the recorders. The tip deflection also matches the closed-form PL³/3EI = 4.5 mm exactly.
