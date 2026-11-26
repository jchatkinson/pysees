---
title: Multi-point constraints in 3D
description: A rigid diaphragm under torsion, plus rigid links joining outrigger columns.
features: rigidDiaphragm, rigidLink bar, rigidLink beam, 3D
---

Four columns carry a floor modelled as a `rigidDiaphragm` (perpendicular to Z) with a torque on its master node. Two more columns are joined by a `rigidLink bar`, and a loaded point hangs on a `rigidLink beam`.

The diaphragm rotation depends on every column's lateral and torsional stiffness, so it checks the constraint transformation in 3D.
