---
title: PDF underlays
description: Put drawing sheets under a story plan and model over them.
order: 4
keywords: pdf underlay drawing sheet background trace calibrate align crop scale knockout plan
---

An underlay is a page of a PDF drawing set shown under a level's plan, so you can draw grids, members and walls over the architectural or structural plans. Underlays are layout, like grids and levels: they are not part of the model, are never exported to OpenSees and don't affect results.

Open **Model > Underlays**.

## Importing a sheet

**Import PDF…** opens a file and lets you pick:

- the pages to add,
- the level to put them on (or the base),
- the drawing scale printed on the sheet, such as `1/8" = 1'-0"` or `1:100`. A unitless model asks for model units per paper inch instead.

Each page becomes one underlay, placed with the page's bottom-left corner at the origin.

## Placing it

![The PDF underlays dialog listing six sheets with their level, scale, position, rotation, opacity and the calibrate, align and crop tools](/docs/underlays-dialog.png)

Each underlay row has its level, opacity, rotation and visibility, and three tools that work by picking points in the plan:

- **Calibrate:** pick the two ends of a dimension you know and type its real length (for example `24 ft`). This fixes the scale, keeping the first point where it is. Use it when a sheet was printed to fit the page rather than to scale.
- **Align:** pick a point on the sheet, then where it should go in the model (a grid intersection, say), and repeat for a second point. This moves, rotates and scales the sheet in one go; tick **Keep the current scale** to only move and rotate it.
- **Crop:** pick two corners to hide everything outside them, such as the title block. **Show the whole page** undoes it.

**Knock out white** makes the paper transparent, so only the linework shows over the model.

## Showing underlays

An underlay shows in its own level's plan. **View > Sheets** turns them all on or off, and **Sheets 3D** also shows them in the 3D view at their level, which helps to check that floors line up.

## Saving

The PDF itself is kept in your browser's storage, not in the saved project: a project records each underlay's placement and the file's name and fingerprint. Opening the project on another computer shows a placeholder and a *PDF not in this browser: relink* link in the Underlays dialog until you point it at the same file.

The [BC Rowhouse template](/docs/files/templates#bc-rowhouse) comes with its plan sheets already placed.
