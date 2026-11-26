---
title: Multi-point constraints
description: equalDOF, rigidDiaphragm, rigidLink and related constraints.
order: 8
keywords: equalDOF rigidDiaphragm rigidLink mp constraint
---

The **MP Constraints** group stores `equalDOF`, `equalDOF_Mixed`, `rigidDiaphragm` and `rigidLink` (`beam` or `bar`) constraints. They are saved in projects, written to exported scripts (which then use `constraints('Transformation')`), and applied by Carapace.

To tie a floor's nodes together, select them and assign a rigid diaphragm per level from the [selection panel](/docs/model/editing#selection-panel). 3D models only: a `rigidDiaphragm` in a 2D model is an error, as in OpenSees.
