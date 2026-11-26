---
title: Differences from OpenSees
description: Where Carapace results can differ from OpenSees.
order: 2
keywords: differences opensees shell mass newmark verification accuracy
---

Carapace is tested against OpenSees on the same exported model. For the supported elements, displacements, reactions, element forces and shell resultants match step by step (relative difference around 1e-6). The [verification page](/verification) shows every comparison, with plots, the model and the exported script.

Known differences:

- **Shell mass is lumped**, so modal frequencies of shell models agree only approximately (within 10% on a coarse mesh).
- **P-Delta includes P-δ**: Carapace's `PDelta` uses the consistent geometric stiffness, OpenSees' only the chord term N/L. They differ by a few percent under heavy axial load.
- **A record that starts at a non-zero acceleration** starts from the consistent initial acceleration in Carapace and from zero in OpenSees. Pad it with a zero sample to match.
- **Corotational end shears** are reported with the current chord length in Carapace and the undeformed length in OpenSees.
- **Transient analysis** uses fixed-step Newmark only.
- **Wipe Analysis** does nothing, since each stage starts fresh.
- **Unsupported items** are skipped or defaulted with a warning rather than silently approximated. See [Supported features](/docs/carapace/supported-features).

> [!TIP]
> If a model uses something Carapace skips, export the script and run it in OpenSees.
