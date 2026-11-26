---
title: Stud walls
description: Light-frame shear walls with lumber framing, openings, sheathing and hold-downs (Carapace only).
order: 23
keywords: stud wall light frame wood shear wall sheathing nail o86 lumber spf dfl hold-down anchorage opening header jack cripple pier diaphragm flexible carapace
---

A **stud wall** is a Carapace element for a wood-framed shear wall: studs and end posts, top and bottom plates, openings with headers, and sheathing nailed to the framing. It carries gravity through its studs and lateral load through its sheathing, and is held down at each pier end.

> [!NOTE]
> Stud walls run in Carapace only. An exported OpenSees script approximates each wall as elastic shells and says so in a warning comment.

## Drawing walls

Use the **Stud wall** tool in a story plan of a 3D model (see [Drawing tools](/docs/model/drawing-tools)). Click the wall's start and end points; each wall spans the story below the plan, from the level below (or the base) up to the plan's level. Keep clicking to draw a chain of walls; after the first point you can type a length.

The options choose the **wall type**: like an existing wall, the default wall, or one you edit with **Edit wall type…** (stud spacing, lumber, sheathing, hold-downs and so on).

A wall's pier ends are held down to whatever is under them: the ground on the first story, or the top of the wall or beam below. A hold-down is an `Anchorage` material (a tension stiffness with a bearing law); it is created with the wall and listed with the materials. The wall card warns about any pier end without one.

## The wall card

Selecting a wall shows its card. **Apply layout** rebuilds the wall from the edited values; **Reset** discards the edits.

![The stud wall card: summary, lumber, studs, top chord distribution and the first opening](/docs/stud-wall-card.png)

| Section | Holds |
|---|---|
| **Lumber** | Species and grade (CSA O86 or NDS), stud size and plies of the end posts, top and bottom plates. Their E and sizes set the framing's EA and EI |
| **Studs** | Spacing, and extra stud positions (x from the start corner, comma-separated) |
| **Openings** | Each window or door: left edge (absolute, or relative 0–1 along the wall), width, head height, sill (drawing only) and header |
| **Sheathing** | The shear law: CSA O86 (Bv, nail spacing, nail diameter), or a linear Ga |
| **Stiffness** | The EA and EI the lumber gives; type a value to override it, clear it to go back |
| **Floor zone** | The depth of the floor framing on top of the wall, and its shear stiffness |
| **Top chord distribution** | How loads on the wall's top reach its studs: through the top plates as a **Beam**, or **Direct** |

## Loads

- **Wall loads** (an element load on the wall): a point or line load along the wall's top, in the wall's plane and vertically.
- **Floor loads** reach walls through [joist floors](/docs/model/joist-floors).
- Wall self-weight is not included.

## Diaphragms

Walls on a level are tied together by a diaphragm, assigned from the [selection panel](/docs/model/editing#selection-panel): **rigid** (a `rigidDiaphragm` constraint) or **flexible** (Carapace-only diaphragm elements with a sheathing Ga and chord EA).

## Results

The **Display Results** panel lists, at the current step, each wall's base reaction (shear, axial, moment) and, per pier, the shear flow, shear strain, base and top moments and left and right chord forces, or the force in each framing member.

![Axial force in the rowhouse's framing members after the gravity and earthquake run, with the wall reaction table in the Display Results panel](/docs/stud-wall-results.png)

With the **N** (axial) result shown, the panel's **Stud walls** choice picks what the viewport draws:

- **Piers (chord forces):** each pier's chord forces.
- **Members (studs, posts, jacks, cripples):** the axial force in every framing member, drawn as bars on the wall and as heat-coloured framing in the extruded view. Each wall labels its largest tension and compression.
