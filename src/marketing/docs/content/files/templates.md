---
title: Templates
description: The starter models in the New model dialog.
order: 2
keywords: template moment-curvature cantilever frame plate shell precast wall connector starter
---

Each template ships with loading and a Whole Model Recorder, so it runs immediately. All are in N, m, s and shown as MPa and kN.

| Template | Model | Parameters |
|---|---|---|
| **Moment-Curvature** | 2D. Zero-length fiber section, 300 × 500 mm, four Ø20 bars, 40 mm cover; Steel01 and Concrete01 | none |
| **Cantilever Column** | Column with a fixed base | element count, height, element type (elastic or fiber) |
| **2D Frame** | Multi-storey, multi-bay frame with grids, levels, gravity loads, masses and an earthquake setup | stories, storey height, bays, bay width, element type, base (fixed or pinned) |
| **3D Frame** | Z-up elastic frame with levels, fixed base | stories, storey height, bays and bay width in X and in Y |
| **Plate** | Cantilever slab of ShellMITC4 shells, clamped at x = 0, with self-weight and pressure | elements in x and y, length, width, thickness |
| **Precast Wall** | 2D. Four 10 ft × 38 ft × 8 in precast panels of `DispBeamColumn` fiber elements, joined at each vertical joint by 13 zero-length connectors (Steel02 shear, elastic axial) and standing on a rigid base beam with compression-only bearings, Steel02 dowels and Coulomb friction. Gravity, then a displacement-controlled pushover | panels, panel width and height, thickness, story heights, connectors per joint, connector stiffness, yield force and post-yield ratio, friction on or off and its coefficient |

The Precast Wall is the benchmark of the PCI Journal paper *Influence of Vertical Connection Stiffness and Deformation Capacity on the Seismic Performance of Intermediate Precast Concrete Shear Walls*, built as in its OpenSeesPy study. Its pushover agrees with that study's OpenSees pushover to within 2% (base shear of 437 kip at 1 in of roof displacement, 570 kip at 2.9 in). Each panel has fiber elements with nodes at the base, the top of the 5 ft splice region, the 13 connector elevations (H/14 apart) and the roof, and rigid arms to the panel edges at the base and at every connector. The base has 11 bearings per panel (12 in apart); the two at the panel edges carry friction, and dowels sit 1 ft from each edge in parallel with the bearings there (two #9 bars at the ends of the assembly, two #4 at the interior edges). Gravity is the panels' self-weight plus a roof axial load of 0.5% of Ag f'c; the 670 kip floor weights at 14, 26 and 38 ft are mass only. The pushover is an inverted triangle of 17%, 33% and 50% of the load at those floors, pushed to 1% drift at the first panel's roof.

The form sets the panels, connectors, story heights and friction. The rest, including concrete and steel strengths, reinforcement, bearing and dowel properties, take the paper's values and are in the model; the template function takes them all as parameters.

Friction runs in Carapace only. OpenSees' `zeroLength` has no friction, so an exported script writes the edge bearings without it and says so in a comment. Turn friction off for a model that runs the same in both; the edge bearings then carry shear through an elastic spring.

One difference from the study remains: its panel sections add an elastic shear response (OpenSees `Aggregator`), which Carapace's fiber sections do not have, so shear deformation of the panels is not modelled.

A heavily loaded or very slender wall can crush its toe before the target drift. The run then stops with the step it reached, and the results up to that step are kept.
