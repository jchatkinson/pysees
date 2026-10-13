---
title: Differences from OpenSees
description: Where Carapace results can differ from OpenSees.
order: 2
keywords: differences opensees shell mass newmark verification accuracy
---

Carapace is tested against OpenSees on the same exported model. For the supported elements, displacements, reactions and element forces match step by step (relative difference around 1e-6).

Known differences:

- **Shell mass is lumped**, so modal frequencies of shell models agree only approximately.
- **Transient analysis** uses fixed-step Newmark only.
- **Wipe Analysis** does nothing, since each stage starts fresh.
- **Unsupported items** are skipped or defaulted with a warning rather than silently approximated. See [Supported features](/docs/carapace/supported-features).

> [!TIP]
> If a model uses something Carapace skips, export the script and run it in OpenSees.
