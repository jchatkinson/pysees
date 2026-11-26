---
title: Views, extruded view and fly mode
description: 3D, story plans and grid elevations, the extruded view, and flying the camera.
order: 2
keywords: plan elevation 3d orthographic perspective story level extrude extruded section shape fly walk camera wasd page up down ghost
---

The **View** group (on the Model, Edit, View and Results tabs) switches between three kinds of view. The current one is named in the viewport's top-left corner.

| View | Camera | Shows |
|---|---|---|
| **3D** | Perspective, or orthographic with **Ortho** | The whole model |
| **Plan** (3D models) | Orthographic, looking down, +Y up | One story: the members and walls whose top is at that level, and the columns and walls below it |
| **Elevation** | Orthographic, facing a grid line | The members within half a bay of the grid. A 2D model has one elevation, the whole frame |

![The BC Rowhouse in the second-floor plan, with the architectural sheet as an underlay under the walls and joists](/docs/rowhouse-plan.png)

A plan or elevation is a slice: objects outside it are neither drawn nor pickable, and results are drawn on the slice only.

## Stepping through stories and grids

- **Up / next** (<kbd>Page Up</kbd>) and **Down / prev** (<kbd>Page Down</kbd>) step to the story above or below in a plan, or to the next parallel grid in an elevation. The **Stories** picker jumps straight to one.
- Stepping between plans keeps the camera's position and zoom.
- **Above** shows the story above a plan as dashed outlines.

## Extruded view

**Extrude** draws members at their section shape instead of as lines:

- Fiber sections use their outline. Elastic members are drawn as the rectangle with their area and stiffnesses; trusses as a square of their area.
- Members that lie in a level (beams, joists) hang from their axis, with their top face on the node line, so they don't stick up through the floor. This is drawing only; the analysis has no offset.
- Shells are drawn as slabs of their thickness. [Stud walls](/docs/model/stud-walls) are drawn as their framing (studs, posts, plates, headers, sills, see-through sheathing) and [joist floors](/docs/model/joist-floors) as their joists, rims and subfloor.

![The BC Rowhouse in the extruded 3D view: stud wall framing, joists and the roof](/docs/rowhouse-3d.png)

Displaced shapes in results stay as lines.

## Fly mode

In the 3D perspective view, **Fly** (<kbd>Shift</kbd>+<kbd>F</kbd>) lets you move the camera through the model and look around, for example to walk inside a building.

| Input | Does |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or the arrow keys | Move forward, left, back and right, the way you are looking |
| <kbd>E</kbd> or <kbd>Space</kbd> / <kbd>Q</kbd> or <kbd>C</kbd> | Move straight up / down |
| Right-drag | Look around (the cursor is hidden while you drag) |
| Mouse wheel | Step forward or back |
| <kbd>Shift</kbd> / <kbd>Alt</kbd> | Four times faster / four times slower |
| <kbd>Esc</kbd>, <kbd>Shift</kbd>+<kbd>F</kbd> or **Fly** | Stop flying |

The speed scales with the size of the model. The view stays level: it never rolls, and looking up or down stops just short of vertical. Left-click still selects. When you stop, orbiting carries on about a point straight ahead of the camera. Switching to an orthographic view, a plan or an elevation also ends fly mode.
