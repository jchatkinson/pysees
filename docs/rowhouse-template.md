# BC Rowhouse template (test case)

`lib/rowhouseTemplate.ts`, the **BC Rowhouse** card in New Model. It models a real drawing set: the CMHC Housing Design Catalogue's
BC rowhouse prototype, `docs/BC_Rowhouse_Drawings_full.pdf`. It is the reference model for the stud-wall, floor and results work.

## Sources

| Sheet (PDF page) | Used for |
| --- | --- |
| A101 / A102 / A103 (11, 13, 15) | Grids, wall lines, rough openings (gaps in the wall outlines, widths snapped to the dimension strings); underlays |
| A200 / A201 (16, 17) | Sill heights (AFF tags), window/door types per elevation |
| A300 (18) | Levels: T/O F/F 2858, second-storey wall 2504, gable roof |
| A004 (5) | Window and door sizes (heads: windows 2134, DA01 2083) |
| Structural notes and schedules (19, 20) | W1 2x6 SPF @ 400, (2) 2x6 top plate; SW1-A / SW2-B sheathing and nailing; L1 (2) 2x10; J1/J2 2x12 SPF @ 400 + 16 mm ply |
| S101 / S102 / S103 (21–23) | Joist directions (second floor N–S, 610 mm south cantilever; roof E–W between grids 1/3/5); underlays (hidden) |

`public/templates/bc-rowhouse-plans.pdf` holds the six plan sheets (A101–A103, S101–S103). The template stores it in the underlay file store and
places each sheet on its level at 1/4" = 1'-0", fitted to the walls (the S sheets print about 1.6 % smaller than the A sheets, and their grey
grids don't sit on the walls, so they are fitted to the wall centrelines instead).

## Model

- Units N, mm, s. Grids 1–5 at 2743; D = 0, C = 2057, B = 10363, A = 12420 (north up). Wall centrelines are on the grids. Unit 2 is unit 1
  mirrored about grid 3 and moved one bay (2057) north; the template describes unit 1's framing and mirrors it.
- Levels: second floor 2858, roof bearing 5664 (2504 framing + a 302 floor zone: 2x12 + 16 mm ply, at both levels).
- Main floor, 11 walls: each unit's north, south and outer side wall, grid 3 in three pieces (D–C, the party wall C–B, B–A), and the interior
  bearing wall by the stair (unit 1 x = 4000 from y = 2010 to B; three doors, the southern one under a (3) 2x12 header; nominal linear
  Ga 1000 N/mm, it is not a shear wall). South-wall openings have (3) 2x12 headers (S102), others (2) 2x10 (L1).
- Second floor, 9 walls: the south walls stand 610 mm south of the walls below, on the cantilever, and the side walls run out to them;
  grid 3 is unit 1's east wall (to C − 610), the party wall and B–A.
- Walls are drawn with `drawStudWall` (openings and lumber framing). Main-floor walls get extra studs wherever something lands on them (a
  second-floor pier end, a beam or joist end, a floor-zone corner), so every pier end above has a node to be held down to. Hold-downs are
  linear `Anchorage` (15 kN/mm tension, 1e6 bearing).
- Second floor framing (S102), as `ElasticBeamColumn` members at the floor plus joist floors:
  - (5) 2x12 D.Fir beam at y = 3140 from the west wall to the interior wall; (3) 2x12 header at y = 2440 across the stair void's south end
    (interior wall to party wall). Split where joists land.
  - Under each second-floor pier end with no wall below: a (2) 2x12 SPF cantilever, tip → south wall → beam. The wall above is held down to
    its tip node.
  - Joist zones (2x12 SPF @ 400, continuous): the cantilever zone (N–S, from the overhang edge over the south wall to the beam and header),
    west of the interior wall (E–W, west wall to interior wall), and north of the stair void (E–W, interior wall to party wall). The stair
    void (to y = 5970) has no floor.
- Roof: per unit, E–W between grids 1/3/5 over the whole second storey, cantilever included.
- Rigid diaphragms at both levels over every wall's top nodes and the floor members.
- Patterns: Dead (floor 1.2 kPa, roof 1.0 kPa), Live 1.9 kPa, Snow 1.6 kPa, Earthquake X / Y (26 kN at the second floor, 45 kN at the roof:
  an illustrative equivalent static split, not a design value). Y's factor is 0: swap the factors to run Y. These are placeholders
  (the drawings give no loads; their note lists Victoria, Vancouver, Kelowna and Prince George).
- Analysis: whole-model recorder, static D + L + S (held), static earthquake.

Joist strips that bear on a beam are solved in PySees (`floorTransferRows`: same `stripReactions` statics; wall shares become top-line wall
loads, beam shares nodal loads on the beam's nodes); strips on walls only stay Carapace floor-transfer rows.

`rowhouseTemplate.test.ts`: geometry counts, every pier end anchored, each floor's takedown totals its area, the Carapace run's base
reactions equal the gravity loads (to 1e-6) and the earthquake force.

## Known gaps (next improvements)

1. **Shear wall types.** Every exterior wall uses SW1-A (12.5 mm ply one side, 3.33 mm nails @ 100). SW2-B (both sides, @ 75) on the
   north/south walls needs two-sided sheathing in the wall law.
2. **Roof.** The vaulted trusses are a flat joist roof at the plate; no gable end walls, no roof slope or overhangs.
3. **Self-weight.** No wall dead load.
4. **Cantilever load path.** The floor's own load on the cantilever goes to the south wall and beams by strip statics; the walls on the
   cantilever load only the (2) 2x12 joists under their pier ends (no load sharing with the neighbouring joists, no blocking).
5. **Stair void edges.** The L1 header at the void's north end and the trimmers along it carry nothing (the joists beside them run parallel).
6. **OpenSees export.** The script is written (walls as elastic shells, floors as nodal loads, with warnings), but its analysis is singular
   in OpenSees: the stud-wall shell approximation (`studWallExport.ts`) has never been run end to end.
