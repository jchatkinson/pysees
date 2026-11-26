---
title: View tab and display
description: Toggle what is drawn in the viewport, and how labels are shown.
order: 3
keywords: view tab show hide node ids element ids supports loads grid levels sheets labels extrude isolate
---

The ribbon's **View** tab holds the view commands and display toggles. Defaults are in brackets.

| Group | Commands |
|---|---|
| **View** | 3D, Plan, Elevation, Ortho, Fly. See [Views](/docs/viewport/views) |
| **Stories** | The story or grid picker, Up / next, Down / prev, Above |
| **Zoom** | Zoom in, Zoom out, Fit (<kbd>F</kbd>) |
| **Show** | Extrude (off), Nodes (on), Elements (on), Supports (on) |
| **Isolate** | Isolate, Show all. See [Selecting and editing](/docs/model/editing#select-isolate-and-delete) |
| **Loads** | Nodal (on) and Element (on) loads, load Values (off), and a picker to show or hide each pattern |
| **Labels** | Node IDs (off), Element IDs (off) |
| **Reference** | Ground grid (on), Grids (on), Levels (on), Sheets (on), Sheets 3D (off, 3D models). See [PDF underlays](/docs/viewport/underlays) |

View settings are saved with the project.

## Labels

Grid bubbles, level names, IDs, load values and result values are drawn in the 3D scene at a fixed size on screen, so the model hides the ones behind it. ID and value labels show through a little of the member they sit on, so a node inside an extruded member keeps its label.

Above 5,000 nodes or elements in the view, ID and result value labels are not drawn; the view's name in the corner lists the labels hidden this way. Loads are drawn without values above 500 load arrows.
