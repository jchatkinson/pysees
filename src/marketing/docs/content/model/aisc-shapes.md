---
title: AISC shapes
description: Fill a steel template from the AISC shapes database.
order: 18
keywords: AISC W HSS pipe angle channel catalogue database
---

When a steel template is selected, the **AISC** picker appears. It is a searchable list of the AISC v16 database covering W, M, S, HP, C, MC, L, HSS and Pipe shapes.

![The AISC picker with W14X90 selected and its geometry applied to the steel I-shape template](/docs/aisc-picker.png)

1. Search for and pick a shape, such as `W14X90`.
2. Set **Model length units** (m, mm, in or ft) to match your model.
3. Press **Use section geometry** to fill the template's parameters.

> [!NOTE]
> Fillets, flange tapers and HSS corner radii are not modelled, so fiber areas are close to, but not exactly, the catalogue values.

If the database fails to load, a **Retry** button appears.
