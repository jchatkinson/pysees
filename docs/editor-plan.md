# Editor plan: ETABS-style modelling, views and results toolbar

Status: proposal. Today a model is built through the OpenSees command form (`CommandForm`): node by node, element by element,
picking node ids. The viewport only displays and selects. The goal is an editor where you draw members on grids and levels,
assign properties to a selection, and flip between plan, elevation and 3D views and between result displays from a toolbar.

The model stays what it is (`Model` entity maps, `applyModelWrite`, schemas, export). Everything below is a layer that **emits
ordinary `ModelWrite`s**, so save, export, Carapace and undo keep working unchanged. Nothing new enters the `Model`; frame
properties are derived from the elements (section 2).

---

## 1. Ribbon toolbar

The reference screenshot gets one thing right: grouped, always-visible toggles (Loading / View / Stories / Analysis view / Other).
We'll copy that structure, not the colours. Use the existing light shadcn theme, `radius=0`, and lucide icons.

- `components/ribbon/Ribbon.tsx` replaces the old File/Edit/View menu bar: a header row (logo, File button, tabs, links) over the active tab's command groups.
  Tabs: **Model** (draw/edit/assign), **View** (views, display toggles, stories), **Results** (result type, cases, playback). The Results tab
  enables after a run. Switching to it from a successful run is automatic.
- Groups are `RibbonGroup` (label underneath) of `RibbonButton` (icon + label, `Toggle` for on/off, `DropdownMenu` split button for variants).
  A `ribbonCommands.ts` table holds `{ id, label, icon, group, hotkey, isActive, run, enabled }` for each command, so the ribbon, the menus, a
  command palette (Ctrl+K, later) and `hotkeys.ts` all read from the same commands.
- Collapsible to a single icon row (ribbon height is expensive on laptops).
- Bottom `ActionBar` gets ETABS-style quick toggles: snap on/off and snap types, ortho, show node/element labels, show extruded view, active
  story, and the units chip. Its cursor coordinates read the snapped point while a draw tool is active.

## 2. Drawing tools (Model tab)

### Tool framework
- Store: `activeTool: ToolId` (`select` default) plus transient `toolState` (points clicked so far, preview). Esc → back to select;
  right-click or Enter finishes a polyline.
- `lib/editor/tools/*.ts`: each tool is a small state machine `{ onPointerMove(pt), onClick(pt, mods), onKey, preview(): PreviewGeom, commit(): ModelWrite[] }`.
  Keeping tools as plain functions keeps them testable without R3F.
- `components/r3f/ToolLayer.tsx` routes pointer events to the active tool and draws the rubber-band preview and snap glyph.
- **One undo step per tool commit.** Add `writeModelEntities(writes: ModelWrite[])` to the store (one snapshot, then apply all). Today
  `writeModelEntity` snapshots per write, which would make "draw 20 beams" 40+ undo steps.

### Snapping (`lib/editor/snap.ts`)
- Work plane: the active story's level (plan view), the active grid line's vertical plane (elevation view), or in 3D the level nearest the
  cursor ray. The cursor ray is intersected with the work plane, then snapped in priority order: existing node → grid intersection at level →
  member midpoint / end → perpendicular-to-member → on grid line → on member → increment grid (`Snap 1/8`-style step from the ActionBar).
- Ortho/angle lock (Shift): 0/45/90° in the work plane. Typed input: after the first click, typing `6` or `6 ft` (through `units.parse`) sets
  the length along the current direction, and `@dx,dy` sets a relative offset.
- Snap index is rebuilt from nodes, elements and grids when they change (a flat array is fine at these model sizes; a grid hash later if needed).

### Node merging
Drawing never asks for node ids. `lib/editor/nodes.ts` `ensureNode(coords, tol)` returns an existing node within tolerance or a new
node write (ids from `nextIds`). Tolerance comes from model units (default 1e-6 × model extent).

### Tools
| Tool | Behaviour | Writes |
|---|---|---|
| Draw frame (polyline) | click-click-…; each segment one member | nodes + elements |
| Quick draw beams | click a grid bay in plan → beam on each bounded grid segment; drag a window to fill many bays | nodes + elements |
| Quick draw columns | click grid intersections in plan → column from this story's level down to the one below; window for many | nodes + elements |
| Quick draw braces | click a bay in elevation → X / single / chevron (dropdown) | nodes + elements |
| Draw shell / quick shell | 4-click quad, or click a bay → floor/wall panel; meshes with `plateMesh.ts` at a chosen size | nodes + ShellMITC4/ShellDKGT |
| Draw node / support | click points; support variant writes `fix` with a preset (pinned/fixed/roller) | node, fix |
| Draw zero-length / link | click two coincident or near nodes | element |

**"Frame property" (ETABS's "section property").** An OpenSees element needs `eleType` + section/material args + `geomTransf` +
`beamIntegration`, and the draw tool must not ask for all of that per click. **Properties are derived, not stored**:
`lib/editor/properties.ts` `deriveFrameProperties(model)` groups elements by (element type, section, integration, plus the elastic
args for `elasticBeamColumn`/`Truss`). Each group is a property, named from its section (template/AISC label, else "Section N") with
the element type when sections are shared across types. Memoized on `model.elements`/`sections`. No new entity, no directive, nothing
in the saved file. Shell properties are derived the same way (element type + section), links by element type + materials.
- **Draw with:** the draw-tool options strip (floating over the viewport, like ETABS's "Properties of Object") lists the derived
  properties plus "New…" (pick element type + section + integration). The current choice is UI state (`drawProperty` in the store), so
  a property nobody uses yet exists only until the file is closed; once one element is drawn with it, it's derived from then on.
- **Role and orientation** are also derived, not stored: vertical member → column, horizontal → beam, otherwise brace. The draw commit
  picks the default `vecxz` from the role and reuses an existing identical `geomTransf` before making a new one. The 2D case needs no vecxz.
- **Select / reassign by property:** "select all of property P" is a filter on the derived groups; "assign property" rewrites the
  selected elements' type/section/integration, after which they simply fall into the other group.
- Trade-off accepted: no custom property names, and no unused properties kept in the file.

### Edit tools (operate on the selection)
Move, copy/replicate (linear ×n, mirror, to stories), divide members (n equal / at intersections / at grid lines), merge
coincident nodes, extrude point→line / line→area, rotate local axes (edits the transform's vecxz or rotates angle), delete. Each
is one `writeModelEntities` batch. Replicate-to-stories is the big ETABS time-saver: "similar stories" mode applies a draw on one
story to all selected stories (toggle in the ActionBar like ETABS's One Story / Similar Stories / All Stories).

### Assign (operate on the selection)
Ribbon "Assign" group: frame property, shell property, supports (preset restraints), nodal loads / member distributed loads / shell
pressure to a chosen pattern, masses, rigid diaphragm per story (writes `rigidDiaphragm` with an auto master node at the centre of mass),
end releases (later: needs element support or zero-length insertion; diagnostic until then). Assignments open a small dialog
pre-filled from the first selected object; the command form remains the escape hatch for anything else.

### Selection upgrades
- Selection becomes `{ nodes: Set, elements: Set }` (today: node ids, or a single element through `selectedModelEntity`). Window and
  crossing select include elements (segment–rect test, which already exists for nodes only). Ctrl-click toggles.
- Left-panel "Select" section in the style of the screenshot: All beams / columns / braces / walls / floors / nodes, by property, by
  story, by pattern, "disconnected members", inverse, previous. Counts beside each.
- Properties pane (right panel, "Command" tab renamed **Properties**): a summary for multi-selection with editable common fields (property,
  transform), and the full schema form for a single object as today. A fiber-section element shows its `SectionPreview` (outline +
  fibers + rebar) here; this is where fiber detail lives, not in the 3D view.

## 3. Views: plan, elevation, 3D, extruded

### Camera
- `ViewportScene` gets a `viewMode: { kind: '3d' } | { kind: 'plan'; levelId } | { kind: 'elevation'; gridId | axis+offset }`.
  Plan and elevation use an `OrthographicCamera` (the perspective/ortho toggle in `ActionBar` already exists; reuse it), looking down -Z
  for plan and normal to the grid line for elevation, with rotation disabled (pan/zoom only). 3D restores the last orbit camera.
- In 2D models only "elevation" (the XY plane) and 3D exist; plan is disabled.
- Story stepping: ribbon "Stories" group with a level dropdown and ▲▼ buttons (PgUp/PgDn), grid dropdown with ◀▶ for elevations.
  The viewport header shows "Plan @ L7 (z = 21.0 m)" like the screenshot's corner label.

### Cutting planes
- `renderer.localClippingEnabled = true` and two global `clippingPlanes` set from the view:
  - Plan @ level i: as ETABS, keep `z ∈ [z(i-1) + ε, z(i) + ε]`, i.e. the floor and the columns/walls below it, drawn normally.
    **Enhancement:** the story above (`z ∈ (z(i), z(i+1)]`) is also drawn, as a dashed, faded outline (projected footprints of
    columns/walls/braces above, beams of the next floor). It is unpickable and unsnappable, so a plan shows what's below and above.
    Implemented as a second pass of the same layers with an "above" material set (`LineDashedMaterial`, low opacity) and its own clip
    range. Toggle in the Stories group (on by default).
  - Elevation on grid g: slab of half the distance to the neighbouring parallel grids on each side.
- Clipping applies to the materials of elements, shells, nodes, supports, loads, labels (HTML labels need a manual position test; do it
  in the label layer by the same bounds) and result diagrams.
- Clipped-away objects are hidden and also **unselectable and unsnappable** (picking filters by the same bounds, not just render).
  A "ghost everything else" toggle draws the rest at 10 % opacity, unpickable, for context.
- 3D view keeps an optional section box (6 planes, draggable later); phase 4.

### Extruded view
- Toggle "Extrude" (ribbon View group + ActionBar). Line elements render as their section outline swept along the member in its local
  frame (`memberFrame.ts`: y = vecxz × x, z = x × y), so orientation matches the analysis.
- Outline source: `sectionOutline(section)` (`lib/sections/outline.ts`, already built and documented as reusable for exactly this).
  Fiber sections without template metadata fall back to the patch bounding box (already implemented there). Interior fibers and rebar are
  never drawn in 3D. Elastic sections (`section Elastic`, `elasticBeamColumn` args) have no shape: draw a square of side `√A`
  (correct area; it can't also match I) in a muted style so it's clearly nominal. Truss: square of area A as well.
- Implementation: one `ExtrudeGeometry`-like prism per distinct (outline, length) is wasteful; instead build per-outline a unit-length
  prism and draw members with `InstancedMesh` (instance matrix = local frame × length). Groups by section → a handful of draw calls.
- Shells: extrude by thickness `h` from `ElasticMembranePlateSection` about the mid-surface.
- `jntOffset` rigid ends drawn shorter on the flexible part, with the offsets as thin lines (later).
- Extruded members are pickable meshes; selection highlight is an outline pass or emissive tint. Deformed shape in extruded mode: keep
  lines for results at first (sweeping along deformed curves is phase 4).

## 4. Results viewing (Results tab)

Today result display lives in `ResultsDisplayPanel` (a floating panel) and the right-panel Results tab. Promote the common switches
to the ribbon; the panels stay for detailed settings.

- **Show** group (radio): None, Deformed, Axial, Shear (Vy/Vz split button), Moment (Mz/My), Torsion, Shell contour (resultant dropdown),
  Mode shapes (mode ◀▶), Reactions (new: arrows + values at supports from the recorded reactions). Maps straight onto `resultsView.type`.
- **Case** group: case/stage dropdown (`caseStage`), step slider, play/pause/loop, smooth, scale −/+/auto.
- **Labels** group: values on diagrams on/off, max/min only (the `ResultExtremaOverlay` data), deformed displacement labels at nodes.
- **Filter**: results also obey the plan/elevation cutting planes, so "moment diagram on grid B elevation" is two clicks.
- Later, when design checks exist: ratios/colour-by-utilisation as another Show entry (the screenshot's "Ratios"); not planned now.
- Click a member in results mode → right panel shows that member's force diagrams along its length and a "plot vs step" button that
  adds series to the existing `PlotOverlay`.

## 5. Stud walls as regular elements

Designed in Carapace: `../carapace/docs/stud-wall-elements-plan.md` (decisions 1–7, PySees phases P1–P5). Carapace's side (C1–C4) is
done. PySees status:

- **Done (P2, P4, P5, part of P1/P3).** The template (`lib/studWalls.ts`) calls Carapace's `expandBuilding` (Z-up) and writes ordinary
  entities: nodes and supports, `studWall` elements (args `{ label, layout, stations }`, nodes = 4 corners + one per chord station),
  anchorage `zeroLength`s with the Carapace-only `Anchorage` material, `equalDOF` / `rigidDiaphragm` constraints, one named pattern per load
  slot (nodal storey forces, `floorLoad` children naming their support walls), a static stage, levels and grids. The `building` entity,
  card, directive and building-only results code are gone. The compiler emits `studWalls`, `floorLoads`, anchorage materials and 3D
  zero-lengths, and records each wall's base reaction and pier quantities (`studWallRecorders`); the results card lists every wall's
  base reaction and the selected wall's piers. Walls draw as filled outlines through their chord nodes (scene kind `wall`), so they
  follow the deformed shape. Selecting a wall or an anchorage shows a read-only card.
- **OpenSees export (decision):** each wall becomes a `ShellMITC4` mesh (`lib/studWallExport.ts`) with an `ElasticMembranePlateSection`
  whose shear stiffness matches the sheathing (`G t = Ga`, or `Bv` for O86), with a WARNING comment giving its axial stiffness relative to
  the studs; anchorage → `Elastic` (tension / initial bearing stiffness); a floor load → its one-way reactions as nodal loads on the support
  walls' top nodes; DOFs nothing stiffens in the shell model are fixed. Project files keep the authored items in generated blocks.
- **Needs** the constraint compiler from the mpConstraints branch (`equalDOF` / `rigidDiaphragm` → Carapace tables, `constraints
  Transformation` in exports): without it the stud-wall runs are rejected (6 tests in `studBuilding.test.ts`).
- **Not yet:** a wall layout editor and drawing tool, flexible-diaphragm elements (`diaphragms` table; the template's flexible option
  works because the expansion loads the walls directly), `wallLoad` element loads, openings and studs in the viewport outline,
  stud-wall results in the plot channel picker.

## 6. Phasing

1. **Foundations** (done): : `writeModelEntities` batch + single undo step; selection set for nodes+elements with
   window/crossing on elements; `ribbonCommands.ts` + `Ribbon` shell with the existing View-menu toggles and zoom/fit moved in.
2. **Views** (done except reactions; slices filter the model instead of using GPU clipping planes): ortho plan/elevation cameras, story/grid stepping, cutting planes with pick filtering, ghosting. Results ribbon tab
   (Show / Case / Labels) over the existing `resultsView`, plus reactions display.
3. **Drawing** (done): tool framework, snapping (node → grid → midpoint, free points on a drawing increment), node merging, derived
   properties, frame / quick beams / quick columns / supports, typed lengths, all-stories drawing in plans, and the multi-selection pane
   (by property, reassign property, supports, delete). "Similar stories" needs a per-level similarity flag and is deferred; window-drag
   for quick beams/columns is not done.
4. **Extruded view** (done): instanced section sweeps for beams/columns/trusses (one `InstancedMesh` per distinct outline), shell slabs at
   their thickness, fiber detail (section preview) in the properties pane. Nominal √A squares for elastic members can dwarf real sections
   when a model uses very stiff elastic links (the precast-wall template's rigid arms); revisit if that's a problem.
5. **Edit & assign** (done except diaphragms): Edit tab with move, copy/replicate, mirror, divide (element loads follow the parts) and
   merge coincident nodes; nodal and uniform member loads assigned to a Plain pattern; shell tool (plan cells / elevation panels meshed
   into divisions, new elastic plate sections). Rigid diaphragms wait on Carapace: its compiler ignores every mpConstraint today
   (flagged separately). Select-by lists beyond the selection pane's "by property" are not done.
6. **Stud walls as elements** (section 5).
7. **Polish** (partly done): command palette (Ctrl/⌘+K, header search) and "Isolate" / "Show all" (show selection only, filtered like
   plans so hidden objects can't be picked) instead of a clipping section box. Not done: extruded deformed shape, end releases.
8. **Performance audit** (first pass done). Measured on a 15-story 8×8-bay frame (1296 nodes, 3375 elements, a load on every beam):
   view toggles went from 9–17 s to ~1.3 s and heap from ~400 to ~170 MB. Changes: the canvas renders on demand (`frameloop="demand"`;
   store changes and `DisplayBuffers` invalidate); loads and supports are one fat-line draw per colour, rewritten only when the camera
   moves (`batchHooks.ts`); id / value / load labels are one DOM layer each (`ScreenLabels`) instead of an `<Html>` per item; drei
   `<Text>` removed (it took the WebGL context down); a lost context shows a notice and rebuilds the scene on restore; Vite ignores
   `.claude/` so agent worktrees don't reload the app. Next: `three-mesh-bvh` picking and instanced node glyph scaling for 10k+ models,
   and profiling on real GPU hardware (this environment renders WebGL on the CPU through SwiftShader).

Tests: tools and snap are pure (`lib/editor/*.test.ts`: a tool fed points produces the expected writes; snap priority; node merging;
transform reuse; property derivation and naming). Playwright is installed but unused; phase 2 is a good time to
add a couple of e2e smoke tests (draw a frame on a grid, run, toggle moment) since these features are mostly interaction.

## Decisions

Frame properties are derived from elements, not stored; plan cut as ETABS plus the story above as dashed ghosts; the ribbon replaces the old menu bar; elastic sections extrude as
a √A square; stud walls become regular elements (section 5).
