---
title: Templates
description: The starter models in the New model dialog.
order: 2
keywords: template moment-curvature cantilever frame plate shell precast wall connector starter grid tower rowhouse stud wall light frame
---

Each template except **Grid only** ships with loading and a Whole Model Recorder, so it runs immediately. Unless noted, they are in N, m, s and shown as MPa and kN.

| Template | Model | Parameters |
|---|---|---|
| **Grid only** | An empty 2D or 3D model with grid lines and story levels, ready to [draw on](/docs/model/drawing-tools). A preview shows the grids as you type | spacings in X and Y and story heights as lists (`3@8 m`, `4.5 m, 3@3.6 m`), units |
| **Moment-Curvature** | 2D. Zero-length fiber section, 300 × 500 mm, four Ø20 bars, 40 mm cover; Steel01 and Concrete01 | none |
| **Cantilever Column** | Column with a fixed base | element count, height, element type (elastic or fiber) |
| **2D Frame** | Multi-storey, multi-bay frame with grids, levels, gravity loads, masses and an earthquake setup | stories, storey height, bays, bay width, element type, base (fixed or pinned) |
| **3D Frame** | Z-up elastic frame with levels, fixed base | stories, storey height, bays and bay width in X and in Y |
| **Plate** | Cantilever slab of ShellMITC4 shells, clamped at x = 0, with self-weight and pressure | elements in x and y, length, width, thickness |
| **Tower** | 3D flat-slab tower for large-model tests: 600×600 columns, 400×700 beams on every grid line and a 200 mm ShellMITC4 slab per level under self-weight and 3.5 kPa. Eigen (6 modes), then gravity. The form shows the node, element and DOF counts | stories, story height, bays and bay width in X and Y, slab elements per bay side |
| **Precast Wall** | 2D. Four 10 ft × 38 ft × 8 in precast panels of `DispBeamColumn` fiber elements, joined at each vertical joint by 13 zero-length connectors (Steel02 shear, elastic axial) and standing on a rigid base beam with compression-only bearings, Steel02 dowels and Coulomb friction. Gravity, then a displacement-controlled pushover | panels, panel width and height, thickness, story heights, connectors per joint, connector stiffness, yield force and post-yield ratio, reinforcement ratios, base dowels, friction on or off and its coefficient |

The Precast Wall is the benchmark of the PCI Journal paper *Influence of Vertical Connection Stiffness and Deformation Capacity on the Seismic Performance of Intermediate Precast Concrete Shear Walls*, built as in its OpenSeesPy study. Its pushover agrees with that study's OpenSees pushover to within 2% (base shear of 437 kip at 1 in of roof displacement, 570 kip at 2.9 in). Each panel has fiber elements with nodes at the base, the top of the 5 ft splice region, the 13 connector elevations (H/14 apart) and the roof, and rigid arms to the panel edges at the base and at every connector. The base has 11 bearings per panel (12 in apart); the two at the panel edges carry friction, and dowels sit 1 ft from each edge in parallel with the bearings there (two #9 bars at the ends of the assembly, two #4 at the interior edges). Gravity is the panels' self-weight plus a roof axial load of 0.5% of Ag f'c; the 670 kip floor weights at 14, 26 and 38 ft are mass only. The pushover is an inverted triangle of 17%, 33% and 50% of the load at those floors, pushed to 1% drift at the first panel's roof.

The form sets the panels, story heights, connectors, friction, the reinforcement ratios (web, boundary, extra in the splice, and the boundary zone length) and the base dowels (yield force, stiffness and hardening, for the two bars at an end of the assembly and at an interior edge). The rest, including concrete and steel strengths, bearing properties, gravity and the lateral pattern, take the paper's values and are in the model; the template function takes them all as parameters.

Friction runs in Carapace only. OpenSees' `zeroLength` has no friction, so an exported script writes the edge bearings without it and says so in a comment. Turn friction off for a model that runs the same in both; the edge bearings then carry shear through an elastic spring.

One difference from the study remains: its panel sections add an elastic shear response (OpenSees `Aggregator`), which Carapace's fiber sections do not have, so shear deformation of the panels is not modelled.

A heavily loaded or very slender wall can crush its toe before the target drift. The run then stops with the step it reached, and the results up to that step are kept.

## Stud-wall building

The **Stud-wall building** template creates a multistorey light-frame box with four stacked wall lines per storey, centred windows in the front and back walls, platform-framed gravity floors, pier-end hold-downs and selectable rigid or flexible diaphragms. The form lets you set storeys, plan dimensions, wall and floor depths, openings, sheathing, lateral load direction and accidental eccentricity, plus a named load-combination preset or editable slot factors. Values are stored in N, mm, s; the form shows m, kN and kPa. Load slots are D, L, S, W and E, followed by three unused slots.

Defaults: 38×140 studs at 406 mm with 3-ply end posts and king studs at the windows (two piers per front/back wall), O86 sheathing (Bv 11 kN/mm, 3.25 mm nails at 150 mm), 254 mm floor and roof bands, hold-downs of 15 kN/mm with the O86 bearing-crush curve, floors spanning between the front and back walls (D 2.0 kPa, L 1.9 kPa; roof D 1.0 kPa, S 2.0 kPa) and a 60 kN base shear distributed as F_i ∝ h_i to the top of each band.

The builder assumes wall lines stack at matching positions, each pier end has anchorage, and floors bear on the walls below (platform framing). The load steps up in one static stage scaled by the combination's slot factors. The walls, floors and diaphragms are ordinary model objects you can edit afterwards (see [Stud walls](/docs/model/stud-walls)). After a run, the Display Results panel shows each wall's base reactions and per-pier forces at the current step. Stud walls run in Carapace only; an exported OpenSees script approximates them as elastic shells, with warnings.

## BC Rowhouse

![The BC Rowhouse template in the extruded view](/docs/rowhouse-3d.png)

The **BC Rowhouse** template is a real drawing set: the two-unit BC rowhouse prototype from the CMHC Housing Design Catalogue, modelled from its architectural (A101–A103) and structural (S101–S103) plans, elevations and section. It is in N, mm, s, and serves as the reference model for stud walls and joist floors.

- **Grids and levels** as on the drawings: grids 1–5 and A–D, the second floor at 2858 mm and the roof bearing at 5664 mm.
- **20 [stud walls](/docs/model/stud-walls)** (2x6 SPF at 400, 12.5 mm plywood) with the drawings' windows and doors and their headers, including the interior bearing walls by the stairs. Each pier end is held down to the foundation, the wall below or the cantilever.
- **Second floor framing as on S102**: a 610 mm cantilever on the south side, (2) 2x12 cantilevered joists under the walls above it, backing onto (5) and (3) 2x12 beams, east–west joists to the interior walls, and open stair voids, all as [joist floors](/docs/model/joist-floors) bearing on walls and beams. The roof spans east–west over the whole second storey.
- **Rigid diaphragms** at both levels.
- **Loads**: dead (floor 1.2 kPa, roof 1.0 kPa), live 1.9 kPa and snow 1.6 kPa, held, then an equivalent static earthquake in X (26 kN at the second floor, 45 kN at the roof). The Y earthquake pattern has a factor of 0; swap the factors to run Y. These are placeholders, not design values: the drawings give no loads.
- **[PDF underlays](/docs/viewport/underlays)**: the six plan sheets placed on their levels. The structural sheets are hidden; turn them on in the Underlays dialog.

Not modelled yet: shear walls sheathed on both sides (SW2-B), the gable roof and wall self-weight.
