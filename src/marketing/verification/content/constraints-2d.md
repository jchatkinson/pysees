---
title: Multi-point constraints in 2D
description: Columns tied by equalDOF, a rigid link and a mixed equalDOF.
features: equalDOF, equalDOF_Mixed, rigidLink beam, Transformation constraints
---

Three cantilever columns: the first two have their tops tied in X with `equalDOF`; a loaded point offset from the first column's top hangs on a `rigidLink beam`; and the third column's top sways with the first column's vertical displacement through `equalDOF_Mixed`.

The exported script uses `constraints('Transformation')`, and Carapace compiles the same ties into its constraint tables. The second plot shows the mixed tie directly: node 7's X displacement equals node 2's Y displacement.
