---
title: Beam integrations
description: Integration rules used by fiber beam-column elements.
order: 6
keywords: beamIntegration lobatto legendre gauss points
---

A `DispBeamColumn` element refers to a beam integration, which fixes the section locations along the member and their weights. Beam integrations are in the **Beam Integrations** group.

Carapace supports **Lobatto** and **Legendre**. Any other integration type is run as Legendre and a warning says so. The exported script keeps the type you chose.
