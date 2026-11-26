---
title: Joist floors
description: One-way joist floors that take area loads down to the stud walls and beams under them (Carapace only).
order: 24
keywords: joist floor area load takedown tributary one-way span cantilever beam bearing stud wall subfloor rim carapace floor load
---

A **joist floor** is a plan outline of any shape with joists running one way across it. It has no stiffness: it collects area loads and carries them to whatever the joists bear on, by statics.

> [!NOTE]
> Joist floors run in Carapace. An exported OpenSees script replaces each floor with the equivalent nodal loads.

## Drawing a floor

Use the **Joist floor** tool in a story plan (see [Drawing tools](/docs/model/drawing-tools)). Click the outline's corners, then click the first point again or right-click to close it. The options set:

- **Joist direction** (degrees from X) and **Spacing**.
- **Joist**: grade, size and plies, for the extruded view and the framing depth.
- **Spans**: **Simple** (each span on its own) or **Continuous** over interior supports.

Leave openings such as stair voids out of the outline.

## How the load gets down

The floor is cut into strips, one per joist spacing, along the joist direction. Each strip is a beam that bears where its centre line crosses a support at the floor's level:

- a **stud wall** whose top is at the floor, or
- a **beam-column** lying in the floor and crossing the joists.

A strip's area load is shared between its supports by statics, overhangs included, so a cantilever past a wall or beam is handled. Strips bearing only on walls are sent to Carapace as floor loads on those walls; strips that bear on a beam are solved in PySees and become line loads on the walls' tops and point loads on the beam's nodes. A strip that bears on fewer than two walls or beams carries no load, and the run reports it as a warning; so is a bearing on a wall shorter than the joist spacing, which is left out.

## The floor card

Selecting a floor shows its card:

![The joist floor card for the rowhouse's cantilever: summary, framing, area loads per pattern and the takedown onto the south wall and beams](/docs/floor-card.png)

- A summary: the floor's depth (joist and subfloor), the walls and beams it **bears on**, and the number of joist strips.
- **Framing**: the joist direction, spacing, joist, spans and subfloor thickness.
- **Area loads**: the floor's load in each load pattern (for example dead, live, snow). Add a load pattern first if there is none.
- **Takedown**: a table of what each supporting wall or beam receives from this floor, per pattern, with the total.

**Apply** saves the edits; **Reset** discards them.

In the extruded view a floor is drawn as its joists, rim joists on the edges no wall carries, and the subfloor.
