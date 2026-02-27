You are helping plan and build a web-based GUI preprocessor/postprocessor for OpenSeesPy
structural models. The app generates a Python script as its output — it does not run
OpenSees itself. Results can be imported back in for postprocessing after the user runs
the script externally.

---

## Core Concept

The app is a parametric model builder. Every user action is a discrete Command object
pushed onto an immutable history stack. The 3D scene and Python script are both pure
functions of replaying that stack — similar to history-based parametric CAD (Fusion 360,
FreeCAD).

CommandHistory[] → replay() → ModelState → Three.js scene
→ .py script output

---

## Tech Stack

- Vite
- React
- Three.js / @react-three/fiber / @react-three/drei
- Shadcn
- TypeScript

---

## UI Layout Aliases

| Alias       | Component         | Description                              |
|-------------|-------------------|------------------------------------------|
| top menu    | `TopBar`          | Mode toggle, undo/redo, export button    |
| left menu   | `HistoryPanel`    | Command history list, script button      |
| right menu  | `CommandForm`     | Command form, script editor, viz controls |
| bot menu    | `ActionBar`       | Status messages, zoom controls, cursor coords, scrubber |
| viewport    | `Viewport`        | 3D R3F canvas                            |

---

## IMPORTANT NOTES: 

- Use standard Shadcn components and architecture wherever possible
- Keep code compact. For example, do not newline every property of an html element or js object. 
- When a task has an unclear outcome, ask for more information.

---

## Initialization

Before the app loads, a mandatory modal captures:
```ts
interface ModelConfig {
  ndm: 2 | 3
  ndf: number  // suggested default: ndm=2→3, ndm=3→6, user-overridable
}
```

This maps to the first openseespy call and the first entry in the command history:
```python
ops.model('basic', '-ndm', ndm, '-ndf', ndf)
```

ndm and ndf are then static constants for the lifetime of the model. All schema
vec lengths that reference 'ndm' or 'ndf' resolve to concrete integers at init time.

---

## Application Modes

The app has two top-level modes toggled via a toolbar:

- **Model mode** — history panel, command forms, 3D model viewport
- **Results mode** — results panel, visualization controls, 3D results viewport

Results state is null until the user imports recorder output files. The model is
read-only in Results mode.

---

## Command System

Each user action is a typed Command:
```ts
type Command =
  | { type: 'MODEL_INIT'; ndm: number; ndf: number }
  | { type: 'ADD_NODE'; id: number; coords: number[] }
  | { type: 'ADD_MATERIAL'; id: number; matType: string; params: number[] }
  | { type: 'ADD_ELEMENT'; id: number; eleType: string; nodes: number[]; matId?: number }
  | { type: 'FIX'; nodeId: number; dofs: number[] }
  | { type: 'ADD_LOAD'; nodeId: number; values: number[] }
  | { type: 'ADD_RECORDER'; recorderType: string; params: object }
  | { type: 'SCRIPT_GROUP'; source: string; commands: Command[] }
  // extend as needed

interface CommandHistory {
  commands: Command[]
  cursor: number  // for undo/redo — replay commands[0..cursor]
}
```

ModelState is derived by reducing over commands[0..cursor]:
```ts
function replay(history: CommandHistory): ModelState
```

**Node movement:** There is no openseespy equivalent of moveNode. Moving a node in the
viewport is a viewport interaction that finds and mutates the original ADD_NODE command
in the history and replays forward. The generated script always emits the final node
position — no move command ever appears. Downstream commands (elements, loads) remain
valid as they reference by ID. Affected downstream commands are highlighted in the
history panel.

**Parametric editing:** Clicking any command in the history panel opens its form for
editing. State rebuilds by re-replaying from that point forward.

---

## Schema System

Each openseespy command has a declarative ArgDef schema. Forms and codegen are both
derived from the same schema — no command-specific UI code.
```ts
type ArgDef =
  | { kind: 'int' | 'float' | 'str'; name: string; label?: string }
  | { kind: 'vec'; name: string; length: number }  // resolved at init from ndm/ndf
  | { kind: 'flag'; flag: string; args: ArgDef[] }  // optional keyword group
  | { kind: 'choice'; name: string; options: string[]; yields: Record<string, ArgDef[]> }

interface CommandSchema {
  cmd: string          // internal command type
  fn: string           // openseespy function name e.g. 'node', 'element', 'fix'
  label: string        // display name
  category: 'model' | 'recorder'  // controls where it appears in the UI
  ndmFilter?: number[] // e.g. [2] means only available in 2D models
  args: ArgDef[]
  optional: ArgDef[]
}
```

Schema files are static JSON/TS, generated once by LLM batch-processing the OpenSeesPyDoc
RST source files, then manually reviewed. The RST docs are the source of truth.

---

## Form Renderer

A generic recursive component walks the ArgDef tree:
```ts
function FormField({ arg, ctx }: { arg: ArgDef; ctx: { ndm: number; ndf: number } })
```

- int/float → number input
- str → text input
- vec of length n → n number inputs inline
- flag → checkbox that reveals its sub-args when checked
- choice → select that reveals the corresponding sub-arg group

---

## Scripting

Users can open a script editor panel and write JS to emit commands programmatically.
This is useful for parametric geometry — grids of nodes, repeated elements, etc.

Scripts run in a **Web Worker** with no DOM, no fetch, no fs access. The only exposed
API is a thin command-emitter surface:
```ts
// available globals inside the worker sandbox
const api = {
  // command emitters
  node: (coords: number[]) => void,
  fix: (nodeId: number, dofs: number[]) => void,
  element: (type: string, nodes: number[], params: object) => void,
  material: (type: string, params: object) => void,
  load: (nodeId: number, values: number[]) => void,
  recorder: (type: string, params: object) => void,

  // readonly model context
  ndm: number,
  ndf: number,
  nodes: ReadonlyMap<number, number[]>,  // id → coords, for referencing existing geometry

  // math helpers
  range: (n: number) => number[],
  linspace: (start: number, end: number, n: number) => number[],
}
```

Example user script:
```js
// 10-node truss chord
for (let i = 0; i < 10; i++) {
  node([i * 1.5, 0, 0])
}
for (let i = 0; i < 9; i++) {
  element('Truss', [i+1, i+2], { A: 0.01, E: 200000 })
}
fix(1, [1,1,1,1,1,1])
```

The Worker collects emitted commands and posts them back as a batch. Scripts land in
the history as a single collapsible **SCRIPT_GROUP** entry containing:

- The script source (re-editable — re-running replaces the group's commands)
- The flat list of emitted commands (shown when expanded)

Re-editing a script source re-runs the worker and replaces the group in-place, then
replays forward. Individual commands within a group are not directly editable — edit
the script instead.

---

## Python Codegen

Each Command maps to one or more openseespy lines. SCRIPT_GROUP is flattened to its
child commands for output. Output is a complete runnable .py file:
```python
import openseespy.opensees as ops

ops.model('basic', '-ndm', 2, '-ndf', 3)
ops.node(1, 0.0, 0.0)
ops.node(2, 5.0, 0.0)
ops.fix(1, 1, 1, 1)
ops.recorder('Node', '-file', 'node_disp.out', '-node', 1, 2, '-dof', 1, 2, 'disp')
# ...
```

---

## 3D Viewport — Model Mode

- Nodes: spheres, clickable/selectable
- Elements: lines (truss/beam) or meshes (shell/brick) based on type
- Boundary conditions: visual glyph per fixed DOF
- Load arrows: nodal loads
- Element local axes: toggleable
- 2D models render in the XY plane, camera locked accordingly
- Selection state feeds into the active command form (e.g. pick node for FIX)

---

## 3D Viewport — Results Mode

Activated after recorder output files are imported. Recorder files are plain text/CSV.
Since the app owns all node/element ID assignment, mapping results back to geometry
is unambiguous.

Supported visualizations:

- **Deformed shape** — node displacements applied as offsets, scale factor slider
- **Element force diagram** — color map or diagram lines for axial/shear/moment
- **Reaction glyphs** — at fixed nodes
- **Time history plot** — 2D chart (separate panel) for dynamic recorder output,
  scrubbing the time axis updates the 3D deformed shape

Results state is separate from model state and never enters the command history:
```ts
interface AppState {
  model: ModelState        // derived from history
  config: ModelConfig      // ndm, ndf — static
  results: ResultsState | null  // imported externally, null until loaded
}
```

---

## History Panel

Sidebar list of all commands in order. Each entry shows command type + summary of
key params. SCRIPT_GROUP entries are collapsible. Recorder commands visually separated
from model commands (e.g. section divider or distinct color).

- Click entry → open form for parametric editing (except SCRIPT_GROUP → opens script editor)
- Undo/redo moves cursor
- Affected downstream commands highlighted after an upstream edit
- Node move via viewport mutates ADD_NODE in place, highlighted in panel

---

## Initial Scope (V1)

Prioritize end-to-end pipeline first, exotic types later.

**Model commands:** model, node, fix, load (nodal), timeSeries, pattern,
geomTransf, element (Truss, ElasticBeamColumn)

**Recorder commands:** Node recorder (disp, vel, accel, reaction),
Element recorder (basic forces)

**Results:** deformed shape + scale slider, basic time history plot

**Scripting:** Web Worker sandbox, SCRIPT_GROUP history entry, re-editable source

This covers a complete simple static or dynamic structural model and validates
the full Command → State → Scene → Script → Import Results pipeline.

---

## Key Constraints

- No OpenSees runtime in the browser — pure preprocessor
- ndm/ndf immutable after init (prompt user to start a new model to change)
- All IDs (nodeTag, eleTag, matTag) managed by the app — no user-assigned tags
- Script output must be valid openseespy — testable externally
- Element palette filtered by ndm at the schema level
- Scripting sandbox: Web Worker only, no eval on main thread, restricted API surface
- Results state never enters command history — it is always derived from external files