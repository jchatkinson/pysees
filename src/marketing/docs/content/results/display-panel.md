---
title: Results display panel
description: Choose what the viewport shows after a run.
order: 1
keywords: case result type scale undeformed values fill display
---

![Switching between the eigen, pushover and earthquake cases and their results in the Display Results panel](/docs/results-display.gif)

After a run, the **Display Results** panel opens over the viewport. Its header has a plot button and a close button.

![The Display Results panel and a bending moment diagram on a 2D frame](/docs/results-moment-diagram.png)

The panel contains:

| Control | Meaning |
|---|---|
| Case | The analysis stage to show |
| Result | None, Deformed shape, Axial force, Shear, Torsion (3D), Bending moment, Shell stress resultants (3D, shells only) or Mode shape (modal cases) |
| Scale | Per result type, with an **Auto** checkbox |
| Show undeformed wireframe | Draws the original shape behind the deformed one |
| Fill diagrams | Fills force diagrams |
| Show values | Labels diagram values |

Diagram types apply to non-modal cases. In 3D, shear is shown as Vy and Vz, and moment as Mz and My, in the beam's [local axes](/docs/getting-started/concepts-glossary).

Playback controls are described in [Step playback](/docs/results/playback).
