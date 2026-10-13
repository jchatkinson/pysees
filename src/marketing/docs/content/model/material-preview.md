---
title: Material preview
description: Drive a material through a strain history and see its stress–strain response.
order: 4
keywords: hysteresis cyclic monotonic protocol strain stress chart
---

The material preview applies a prescribed strain history to a unit spring that uses the material, with the Carapace solver, and charts the result. Open it with **Preview** in the material dialog or when editing a material. It floats over the viewport at the bottom right.

![Previewing a Steel02 material: the load protocol is set, then Run and Animate show its cyclic stress–strain response](/material_preview.gif)

## Load Protocol tab

![The Load Protocol tab with a cyclic protocol and its strain history chart](/docs/material-preview-protocol.png)

| Option | Meaning |
|---|---|
| Type | **Monotonic**, **Cyclic** or **Custom** |
| Max strain | Peak strain of the protocol |
| Number of cycles | Cyclic only |
| Strain increment | Evenly per cycle, or none |
| Custom strain list | Comma-separated strains (Custom only) |

A chart of the protocol and the approximate number of steps are shown as you edit.

## Material Hysteresis tab

![The Material Hysteresis tab showing the cyclic stress–strain loops of a Steel01 material](/docs/material-preview-hysteresis.png)

Press **Run** to solve. The chart plots strain against stress. **Animate** replays the response over about five seconds, and the slider scrubs through the steps. Changing any input clears the old result.
