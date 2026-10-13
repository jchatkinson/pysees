---
title: Grids and levels
description: Reference gridlines and storey levels for modelling and display.
order: 20
keywords: grid levels storeys elevation labels plan
---

Open **Edit > Grids & Levels…**. Two previews (plan and elevation) sit above the tables. **Clear Grids** or **Clear Levels** empties a tab; **Done** closes the dialog.

## Grids tab

![Grids tab with the evenly spaced helper expanded, a table of three grids and the plan preview](/docs/grids-dialog.png)

- **Add evenly spaced grids** (collapsible helper): choose the axis, count, spacing and starting offset, and the extents along the other plan axis. Labels are numeric (1, 2, 3) or alphabetic (A, B, C), with a start index and prefix. **Generate n grids** adds them.
- The table lists each grid's label and start and end coordinates, all editable. **+ Add custom** adds one.

## Levels tab

![Levels tab with four levels and the elevation preview](/docs/levels-dialog.png)

- A helper takes count, storey height, start index, label style and prefix.
- The table shows label, height and elevation, with move up, move down and remove. **+ Add custom** adds a level (default height 3).

Grid lines are drawn at each level's elevation. Toggle them with **View > Grids** and **Levels**; **Grid** is the separate reference floor grid. The 2D Frame template creates grids and levels, and the 3D Frame template creates levels.
