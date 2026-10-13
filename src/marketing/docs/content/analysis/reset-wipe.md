---
title: Reset and Wipe
description: Reset the model between stages, or wipe the analysis in exported scripts.
order: 7
keywords: reset wipeAnalysis loadConst
---

- **Reset Model** issues OpenSees `reset`, returning the model to its initial state. Loads frozen by Hold loads stay frozen.
- **Wipe Analysis** issues `wipeAnalysis`. It exists for exported scripts only; Carapace creates fresh analysis objects for every stage, so it is skipped with a warning.
