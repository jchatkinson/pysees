---
title: Truss pushover: MinMax
description: The three-bar truss pushed under displacement control with MinMax bars.
features: Truss, MinMax
---

The three-bar truss with its bars made of Steel01 wrapped in strain limits, pushed down at the apex under displacement control until the material passes its first break point.

Each material in Carapace is its own implementation of the OpenSees model. A single monotonic push checks the backbone; the cyclic cases check the hysteresis rules.
