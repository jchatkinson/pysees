---
title: Grids and levels
description: Reference gridlines and storey levels for modelling and display.
order: 20
keywords: grid levels storeys elevation labels plan
---

Open **Model > Grids & levels**. Two previews (plan and elevation) sit above the tables. **Clear Grids** or **Clear Levels** empties a tab; **Done** closes the dialog.

## Grids tab

![Grids tab with the evenly spaced helper expanded, the table of grids and the plan preview](/docs/grids-dialog.png)

- **Add evenly spaced grids** (collapsible helper): choose the axis, count, spacing and starting offset, and the extents along the other plan axis. Labels are numeric (1, 2, 3) or alphabetic (A, B, C), with a start index and prefix. **Generate n grids** adds them.
- The table lists each grid's label and start and end coordinates, all editable. **+ Add custom** adds one.

## Levels tab

![Levels tab with four levels and the elevation preview](/docs/levels-dialog.png)

- A helper takes count, storey height, start index, label style and prefix.
- The table shows label, height and elevation, with move up, move down and remove. **+ Add custom** adds a level (default height 3).

Grid lines are drawn at each level's elevation. Toggle them with **Grids** and **Levels** on the View tab; **Ground** is the separate reference floor grid. Grid bubbles and level names are drawn in the scene, so the model hides them.

Grids and levels drive the [plan and elevation views](/docs/viewport/views) and the grid-based [drawing tools](/docs/model/drawing-tools). The **Grid only** template creates them from spacing lists (`3@8 m`, `4.5 m, 3@3.6 m`) on an empty model; the 2D Frame and BC Rowhouse templates create grids and levels, and the 3D Frame and Tower templates create levels. To trace a drawing set, put its sheets under the plans as [PDF underlays](/docs/viewport/underlays).
