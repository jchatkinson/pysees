---
title: Eigen analysis
description: Natural periods, frequencies and mode shapes.
order: 6
keywords: eigen modal periods frequency mode shapes participating mass
---

**Run Eigen Analysis** computes the first *n* modes (default 3). It needs mass on free DOFs. If you ask for more modes than there are massive free DOFs the run fails with a message telling you to assign masses.

Afterwards, a modal case offers:

- **Modal Periods and Frequencies** and **Modal Participating Mass Ratios** in the [results tables](/docs/results/tables).
- **Mode Shapes** in the viewport. See [Mode shapes](/docs/results/mode-shapes).

> [!NOTE]
> Carapace lumps shell mass, so shell-model frequencies differ slightly from OpenSees.
