---
title: Drawing tools
description: Draw members, shells, stud walls, joist floors and supports in the viewport.
order: 21
keywords: draw tool frame beam column shell stud wall joist floor support snap typed length all stories property
---

The **Draw** group on the **Model** tab holds the drawing tools. While a tool is on, the right panel shows its options, clicks in the viewport place points instead of selecting, and each finished object is one undo step. **Select** (or <kbd>Esc</kbd> with nothing in progress) goes back to selecting.

Points snap to nodes, grid intersections and the midpoints of members. A new node that lands on an existing one reuses it.

![The Stud wall tool on in the second-floor plan: the Draw panel on the right shows the wall type to draw with](/docs/drawing-tools.png)

## Tools

| Tool | Where | How |
|---|---|---|
| **Frame** | Any view | Click points to draw a chain of members. Right-click or <kbd>Esc</kbd> ends the chain; hold <kbd>Shift</kbd> to lock to an axis. After the first point, type a length (`6`, `20 ft`) and press <kbd>Enter</kbd> to place the next point that far towards the cursor |
| **Beams** | A plan, a grid elevation, or a 2D model, with grids | Click a grid bay to put a beam on it |
| **Columns** | A plan above the base, a grid elevation, or a 2D model, with grids | Click a grid intersection in a plan, or a bay in an elevation |
| **Shells** | A plan or grid elevation of a 3D model | Click a grid cell: a floor in a plan, a wall panel in an elevation. The options set the shell section and the mesh divisions |
| **Stud wall** | A story plan of a 3D model | Click points; each pair makes a wall spanning the story below the plan. See [Stud walls](/docs/model/stud-walls) |
| **Joist floor** | A story plan of a 3D model | Click the outline's corners; click the first point again (or right-click) to close it. See [Joist floors](/docs/model/joist-floors) |
| **Support** | Any view | Click a node to give it the support chosen in the options (fixed, pinned, roller) |

**All stories** (3D, plan views) repeats what you draw on every story at once.

## Frame properties

The Frame, Beams and Columns tools draw with a *property*: an element type and its arguments, such as an elastic beam-column with its A, E and I, or a fiber beam-column with its section. The options list the properties already used in the model; **New property…** creates one. Properties are read from the elements, not stored separately, so editing every element of a property changes it.

Members drawn in 3D get a geometric transformation whose local axes suit their direction; one that matches is reused.
